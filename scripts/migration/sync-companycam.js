#!/usr/bin/env node
// Sync CompanyCam Projects and Photos with Panda CRM Opportunities
import { getPrismaClient } from './prisma-client.js';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const prisma = getPrismaClient();
const secretsClient = new SecretsManagerClient({ region: 'us-east-2' });

const COMPANYCAM_API = 'https://api.companycam.com/v2';
let companyCamToken = null;

async function getCompanyCamToken() {
  if (companyCamToken) return companyCamToken;
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: 'companycam/api-token' })
  );
  const secret = JSON.parse(response.SecretString);
  companyCamToken = secret.api_token;
  return companyCamToken;
}

async function companyCamRequest(endpoint, options = {}) {
  const token = await getCompanyCamToken();
  const response = await fetch(`${COMPANYCAM_API}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`CompanyCam API error: ${response.status} - ${error}`);
  }

  return response.json();
}

async function getAllProjects() {
  console.log('Fetching all CompanyCam projects...');
  const allProjects = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const result = await companyCamRequest(`/projects?page=${page}&per_page=100`);
    const projects = result.projects || result;
    allProjects.push(...projects);
    console.log(`  Page ${page}: fetched ${projects.length} projects (total: ${allProjects.length})`);
    hasMore = projects.length === 100;
    page++;
    // Rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`Total CompanyCam projects: ${allProjects.length}`);
  return allProjects;
}

async function getProjectPhotos(projectId) {
  const allPhotos = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const result = await companyCamRequest(`/projects/${projectId}/photos?page=${page}&per_page=100`);
      const photos = result.photos || result;
      allPhotos.push(...photos);
      hasMore = photos.length === 100;
      page++;
      await new Promise(r => setTimeout(r, 100));
    } catch (error) {
      console.log(`    Warning: Could not fetch photos page ${page}: ${error.message}`);
      hasMore = false;
    }
  }

  return allPhotos;
}

function normalizeAddress(address) {
  if (!address) return '';
  // Combine address parts if it's an object
  if (typeof address === 'object') {
    const parts = [
      address.street_address_1,
      address.city,
      address.state,
      address.postal_code
    ].filter(Boolean);
    address = parts.join(' ');
  }
  // Normalize for matching
  return String(address)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractJobNumber(name) {
  // Match "Panda Ext-XXXXX" pattern
  const match = name?.match(/panda\s*ext[- ]?(\d+)/i);
  return match ? match[1] : null;
}

async function syncCompanyCamProjects(dryRun = false) {
  console.log('=== CompanyCam Sync Started ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  // Get all CompanyCam projects
  const ccProjects = await getAllProjects();

  // Get all opportunities with addresses for matching
  console.log('\nFetching opportunities from database...');
  const opportunities = await prisma.opportunity.findMany({
    select: {
      id: true,
      name: true,
      jobId: true,
      account: {
        select: {
          billingStreet: true,
          billingCity: true,
          billingState: true,
          billingPostalCode: true,
        },
      },
    },
  });
  console.log(`Found ${opportunities.length} opportunities`);

  // Build lookup maps
  const oppByJobNumber = new Map();
  const oppByAddress = new Map();

  for (const opp of opportunities) {
    // Extract job number from name (e.g., "Panda Ext-12345: John Smith")
    const jobNumber = extractJobNumber(opp.name) || opp.jobId?.split('-')[1];
    if (jobNumber) {
      oppByJobNumber.set(jobNumber, opp);
    }

    // Build address key
    if (opp.account) {
      const addressKey = normalizeAddress({
        street_address_1: opp.account.billingStreet,
        city: opp.account.billingCity,
        state: opp.account.billingState,
        postal_code: opp.account.billingPostalCode,
      });
      if (addressKey.length > 10) {
        oppByAddress.set(addressKey, opp);
      }
    }
  }

  console.log(`Built job number lookup: ${oppByJobNumber.size} entries`);
  console.log(`Built address lookup: ${oppByAddress.size} entries`);

  // Process each CompanyCam project
  let matched = 0;
  let unmatched = 0;
  let photosImported = 0;
  let projectsCreated = 0;
  let projectsUpdated = 0;

  for (const ccProject of ccProjects) {
    const projectName = ccProject.name || '';
    const jobNumber = extractJobNumber(projectName);
    const ccAddressKey = normalizeAddress(ccProject.address);

    // Try to match to an opportunity
    let matchedOpp = null;
    let matchMethod = null;

    // First try job number match
    if (jobNumber && oppByJobNumber.has(jobNumber)) {
      matchedOpp = oppByJobNumber.get(jobNumber);
      matchMethod = 'job_number';
    }

    // Then try address match
    if (!matchedOpp && ccAddressKey.length > 10) {
      // Try exact match first
      if (oppByAddress.has(ccAddressKey)) {
        matchedOpp = oppByAddress.get(ccAddressKey);
        matchMethod = 'address_exact';
      } else {
        // Try partial address match (first 30 chars)
        const shortKey = ccAddressKey.substring(0, 30);
        for (const [key, opp] of oppByAddress) {
          if (key.startsWith(shortKey)) {
            matchedOpp = opp;
            matchMethod = 'address_partial';
            break;
          }
        }
      }
    }

    if (matchedOpp) {
      matched++;
      console.log(`\n[MATCH ${matchMethod}] "${projectName}" -> ${matchedOpp.name}`);

      if (!dryRun) {
        // Create or update local project record
        const existingProject = await prisma.companyCamProject.findUnique({
          where: { companyCamId: ccProject.id },
        });

        let localProject;
        if (existingProject) {
          localProject = await prisma.companyCamProject.update({
            where: { companyCamId: ccProject.id },
            data: {
              name: projectName,
              opportunityId: matchedOpp.id,
              address: typeof ccProject.address === 'object'
                ? JSON.stringify(ccProject.address)
                : ccProject.address,
              latitude: ccProject.coordinates?.lat,
              longitude: ccProject.coordinates?.lon,
              syncStatus: 'PENDING',
            },
          });
          projectsUpdated++;
        } else {
          localProject = await prisma.companyCamProject.create({
            data: {
              companyCamId: ccProject.id,
              name: projectName,
              opportunityId: matchedOpp.id,
              address: typeof ccProject.address === 'object'
                ? JSON.stringify(ccProject.address)
                : ccProject.address,
              latitude: ccProject.coordinates?.lat,
              longitude: ccProject.coordinates?.lon,
              syncStatus: 'PENDING',
            },
          });
          projectsCreated++;
        }

        // Sync photos for this project
        console.log(`  Fetching photos for project ${ccProject.id}...`);
        const photos = await getProjectPhotos(ccProject.id);
        console.log(`  Found ${photos.length} photos`);

        for (const photo of photos) {
          await prisma.companyCamPhoto.upsert({
            where: { companyCamId: photo.id },
            create: {
              companyCamId: photo.id,
              projectId: localProject.id,
              photoUrl: photo.uris?.original || photo.photo_url || '',
              thumbnailUrl: photo.uris?.thumbnail || photo.thumbnail_url,
              caption: photo.caption,
              takenAt: photo.created_at ? new Date(photo.created_at) : null,
              latitude: photo.coordinates?.lat,
              longitude: photo.coordinates?.lon,
              tags: photo.tags || [],
            },
            update: {
              photoUrl: photo.uris?.original || photo.photo_url || '',
              thumbnailUrl: photo.uris?.thumbnail || photo.thumbnail_url,
              caption: photo.caption,
              tags: photo.tags || [],
            },
          });
          photosImported++;
        }

        // Update sync status
        await prisma.companyCamProject.update({
          where: { id: localProject.id },
          data: {
            photoCount: photos.length,
            lastSyncedAt: new Date(),
            syncStatus: 'SYNCED',
          },
        });
      }
    } else {
      unmatched++;
      if (unmatched <= 20) {
        console.log(`[NO MATCH] "${projectName}" (${ccProject.id})`);
      }
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n=== CompanyCam Sync Summary ===');
  console.log(`Total CompanyCam projects: ${ccProjects.length}`);
  console.log(`Matched to opportunities: ${matched}`);
  console.log(`Unmatched: ${unmatched}`);
  if (!dryRun) {
    console.log(`Projects created: ${projectsCreated}`);
    console.log(`Projects updated: ${projectsUpdated}`);
    console.log(`Photos imported: ${photosImported}`);
  }

  return { matched, unmatched, photosImported, projectsCreated, projectsUpdated };
}

// Run if called directly
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

syncCompanyCamProjects(dryRun)
  .then((results) => {
    console.log('\nSync completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Sync failed:', error);
    process.exit(1);
  })
  .finally(() => {
    try { prisma.$disconnect(); } catch (e) {}
  });
