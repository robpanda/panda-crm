/**
 * Migrate Photo Tags from CompanyCam API
 *
 * This script fetches tags from the CompanyCam API for all photos
 * and updates the local database records.
 *
 * The initial photo migration did not capture tags. This script
 * re-fetches photo data from CompanyCam to populate the tags field.
 */

import { PrismaClient } from '@prisma/client';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://pandacrm:PandaCRM2025Secure!@panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com:5432/panda_crm"
    }
  }
});

const secretsClient = new SecretsManagerClient({ region: 'us-east-2' });
const COMPANYCAM_API_URL = 'https://api.companycam.com/v2';

// Stats
const stats = {
  totalPhotos: 0,
  photosUpdated: 0,
  photosWithTags: 0,
  photosNoTags: 0,
  errors: [],
  projectsProcessed: 0,
};

async function getCompanyCamToken() {
  const command = new GetSecretValueCommand({ SecretId: 'companycam/api-token' });
  const response = await secretsClient.send(command);
  const secret = JSON.parse(response.SecretString);
  return secret.token || secret.api_token || secret.apiToken;
}

async function companyCamRequest(endpoint, options = {}) {
  const token = await getCompanyCamToken();
  const { default: fetch } = await import('node-fetch');

  const url = `${COMPANYCAM_API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`CompanyCam API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

async function getProjectPhotos(projectId, page = 1, perPage = 100) {
  const endpoint = `/projects/${projectId}/photos?page=${page}&per_page=${perPage}`;
  return companyCamRequest(endpoint);
}

async function migrateTagsForProject(project) {
  console.log(`\n  Processing project: ${project.name} (${project.companyCamId})`);

  let page = 1;
  let hasMore = true;
  let projectPhotoCount = 0;
  let projectTagCount = 0;

  while (hasMore) {
    try {
      const result = await getProjectPhotos(project.companyCamId, page, 100);
      const photos = result.photos || result;

      if (!photos || photos.length === 0) {
        hasMore = false;
        continue;
      }

      for (const photo of photos) {
        stats.totalPhotos++;
        projectPhotoCount++;

        const tags = photo.tags || [];

        if (tags.length > 0) {
          stats.photosWithTags++;
          projectTagCount += tags.length;

          // Update the local CompanyCamPhoto record
          try {
            await prisma.companyCamPhoto.updateMany({
              where: { companyCamId: String(photo.id) },
              data: { tags: tags },
            });
            stats.photosUpdated++;
          } catch (updateError) {
            stats.errors.push({
              photoId: photo.id,
              projectId: project.companyCamId,
              error: updateError.message,
            });
          }
        } else {
          stats.photosNoTags++;
        }
      }

      // Check if there are more pages
      if (photos.length < 100) {
        hasMore = false;
      } else {
        page++;
      }

      // Rate limiting - small delay between pages
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (error) {
      console.error(`    Error fetching page ${page}: ${error.message}`);
      stats.errors.push({
        projectId: project.companyCamId,
        page,
        error: error.message,
      });
      hasMore = false;
    }
  }

  console.log(`    Processed ${projectPhotoCount} photos, ${projectTagCount} tags found`);
  stats.projectsProcessed++;
}

async function migrateAllTags() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('CompanyCam Photo Tags Migration');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('');

  try {
    // Get all projects with photos
    console.log('Step 1: Fetching projects with photos...');
    const projects = await prisma.companyCamProject.findMany({
      where: {
        photoCount: { gt: 0 }
      },
      select: {
        id: true,
        companyCamId: true,
        name: true,
        photoCount: true,
      },
      orderBy: { photoCount: 'desc' },
    });

    console.log(`  Found ${projects.length} projects with photos`);
    console.log('');

    // Check current state of tags
    console.log('Step 2: Checking current tag state...');
    const photosWithExistingTags = await prisma.companyCamPhoto.count({
      where: {
        tags: { isEmpty: false }
      }
    });
    const photosWithoutTags = await prisma.companyCamPhoto.count({
      where: {
        tags: { isEmpty: true }
      }
    });
    console.log(`  Photos with tags: ${photosWithExistingTags}`);
    console.log(`  Photos without tags: ${photosWithoutTags}`);
    console.log('');

    // Process each project
    console.log('Step 3: Fetching tags from CompanyCam API...');
    console.log('───────────────────────────────────────────────────────────');

    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];

      // Progress indicator
      if ((i + 1) % 10 === 0 || i === projects.length - 1) {
        console.log(`\nProgress: ${i + 1}/${projects.length} projects (${Math.round((i + 1) / projects.length * 100)}%)`);
      }

      await migrateTagsForProject(project);

      // Rate limiting between projects
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Final summary
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Migration Complete!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('Results:');
    console.log(`  Projects processed:     ${stats.projectsProcessed}`);
    console.log(`  Total photos scanned:   ${stats.totalPhotos}`);
    console.log(`  Photos with tags:       ${stats.photosWithTags}`);
    console.log(`  Photos without tags:    ${stats.photosNoTags}`);
    console.log(`  Photos updated:         ${stats.photosUpdated}`);
    console.log(`  Errors:                 ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log('');
      console.log('Errors (first 10):');
      stats.errors.slice(0, 10).forEach((err, i) => {
        console.log(`  ${i + 1}. Photo ${err.photoId || 'N/A'}: ${err.error}`);
      });
    }

    // Verify final state
    console.log('');
    console.log('Verification:');
    const finalWithTags = await prisma.companyCamPhoto.count({
      where: { tags: { isEmpty: false } }
    });
    const finalWithoutTags = await prisma.companyCamPhoto.count({
      where: { tags: { isEmpty: true } }
    });
    console.log(`  Photos now with tags:    ${finalWithTags}`);
    console.log(`  Photos still no tags:    ${finalWithoutTags}`);

    // Sample some photos with tags
    if (finalWithTags > 0) {
      console.log('');
      console.log('Sample photos with tags:');
      const samples = await prisma.companyCamPhoto.findMany({
        where: { tags: { isEmpty: false } },
        select: {
          id: true,
          companyCamId: true,
          tags: true,
        },
        take: 5,
      });
      samples.forEach(p => {
        console.log(`  ${p.companyCamId}: ${JSON.stringify(p.tags)}`);
      });
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrateAllTags();
