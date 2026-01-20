/**
 * Repair Script: Create Missing Photo Records
 *
 * Problem: Migration uploaded 6,578 photos to S3 but created 0 Photo records
 * because most CompanyCam projects don't have corresponding PhotoProject records.
 *
 * This script:
 * 1. Finds all migrated CompanyCam photos (migratedToS3 = true, s3Key exists)
 * 2. Creates missing PhotoProject records if needed
 * 3. Creates Photo records for CRM display
 */

import pkg from '@prisma/client';
const { PrismaClient } = pkg;

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + '&connection_limit=5&pool_timeout=60'
    }
  }
});

const S3_BUCKET = 'pandacam-photos-prod';

// Stats tracking
const stats = {
  totalMigratedPhotos: 0,
  photosWithExistingRecords: 0,
  photoProjectsCreated: 0,
  photoRecordsCreated: 0,
  skippedNoOpportunity: 0,
  errors: [],
};

async function findOrCreatePhotoProject(project) {
  // First, check if PhotoProject already exists for this opportunity
  let photoProject = await prisma.photoProject.findFirst({
    where: { opportunityId: project.opportunityId }
  });

  if (photoProject) {
    return photoProject;
  }

  // No PhotoProject exists - we need to create one
  // But first, verify the opportunity exists
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: project.opportunityId },
    include: {
      account: true
    }
  });

  if (!opportunity) {
    console.log(`  ⚠ No opportunity found for ID: ${project.opportunityId}`);
    return null;
  }

  // Create the PhotoProject
  try {
    photoProject = await prisma.photoProject.create({
      data: {
        name: project.name || opportunity.name || 'Photo Project',
        description: `Photos from CompanyCam project ${project.companyCamId}`,
        projectType: 'JOB',
        status: 'ACTIVE',
        street: opportunity.account?.billingStreet || null,
        city: opportunity.account?.billingCity || null,
        state: opportunity.account?.billingState || null,
        postalCode: opportunity.account?.billingPostalCode || null,
        opportunityId: project.opportunityId,
        accountId: opportunity.accountId,
        ownerId: opportunity.ownerId,
        metadata: {
          companyCamProjectId: project.companyCamId,
          createdByRepairScript: true,
          createdAt: new Date().toISOString(),
        }
      }
    });

    stats.photoProjectsCreated++;
    console.log(`  ✓ Created PhotoProject: ${photoProject.id} for ${project.name}`);
    return photoProject;
  } catch (error) {
    console.log(`  ✗ Failed to create PhotoProject: ${error.message}`);
    return null;
  }
}

async function createPhotoRecord(photo, photoProject) {
  // Check if Photo record already exists
  const existingPhoto = await prisma.photo.findFirst({
    where: {
      externalId: photo.companyCamId,
      externalSource: 'COMPANYCAM'
    }
  });

  if (existingPhoto) {
    stats.photosWithExistingRecords++;
    return existingPhoto;
  }

  // Build S3 URLs from stored keys
  const s3Url = `https://${S3_BUCKET}.s3.us-east-2.amazonaws.com/${photo.s3Key}`;
  const thumbnailUrl = photo.s3ThumbnailKey
    ? `https://${S3_BUCKET}.s3.us-east-2.amazonaws.com/${photo.s3ThumbnailKey}`
    : null;

  // Determine file extension from s3Key
  const extension = photo.s3Key.endsWith('.png') ? 'png' : 'jpg';
  const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';

  try {
    const newPhoto = await prisma.photo.create({
      data: {
        projectId: photoProject.id,
        originalUrl: s3Url,
        displayUrl: thumbnailUrl,
        fileName: `${photo.companyCamId}.${extension}`,
        fileSize: 0, // Unknown from CompanyCam
        mimeType: mimeType,
        photoType: 'PROGRESS',
        capturedAt: photo.takenAt ? new Date(photo.takenAt) : new Date(),
        externalId: photo.companyCamId,
        externalSource: 'COMPANYCAM',
        fileKey: photo.s3Key
      }
    });

    stats.photoRecordsCreated++;
    return newPhoto;
  } catch (error) {
    stats.errors.push({
      photoId: photo.id,
      companyCamId: photo.companyCamId,
      error: error.message
    });
    return null;
  }
}

async function repairPhotoRecords() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('CompanyCam Migration Repair: Create Missing Photo Records');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('');

  try {
    // Step 1: Find all migrated photos
    console.log('Step 1: Finding migrated photos without Photo records...');

    const migratedPhotos = await prisma.companyCamPhoto.findMany({
      where: {
        migratedToS3: true,
        s3Key: { not: null }
      },
      include: {
        project: true
      }
    });

    stats.totalMigratedPhotos = migratedPhotos.length;
    console.log(`  Found ${migratedPhotos.length} migrated photos`);
    console.log('');

    // Step 2: Group photos by project
    console.log('Step 2: Grouping photos by project...');
    const photosByProject = new Map();

    for (const photo of migratedPhotos) {
      const projectId = photo.projectId;
      if (!photosByProject.has(projectId)) {
        photosByProject.set(projectId, {
          project: photo.project,
          photos: []
        });
      }
      photosByProject.get(projectId).photos.push(photo);
    }

    console.log(`  Found ${photosByProject.size} unique projects`);
    console.log('');

    // Step 3: Process each project
    console.log('Step 3: Processing projects and creating Photo records...');
    console.log('───────────────────────────────────────────────────────────');

    let projectIndex = 0;
    for (const [projectId, { project, photos }] of photosByProject) {
      projectIndex++;
      console.log(`\n[${projectIndex}/${photosByProject.size}] Project: ${project.name}`);
      console.log(`  CompanyCam ID: ${project.companyCamId}`);
      console.log(`  Opportunity ID: ${project.opportunityId}`);
      console.log(`  Photos to process: ${photos.length}`);

      if (!project.opportunityId) {
        console.log(`  ⚠ Skipping - no opportunityId linked`);
        stats.skippedNoOpportunity += photos.length;
        continue;
      }

      // Find or create PhotoProject
      const photoProject = await findOrCreatePhotoProject(project);

      if (!photoProject) {
        console.log(`  ⚠ Skipping - could not find/create PhotoProject`);
        stats.skippedNoOpportunity += photos.length;
        continue;
      }

      console.log(`  PhotoProject ID: ${photoProject.id}`);

      // Create Photo records for each migrated photo
      let created = 0;
      let existing = 0;

      for (const photo of photos) {
        const result = await createPhotoRecord(photo, photoProject);
        if (result) {
          if (stats.photosWithExistingRecords > existing) {
            existing++;
          } else {
            created++;
          }
        }
      }

      console.log(`  ✓ Created ${created} Photo records, ${existing} already existed`);
    }

    // Final summary
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Repair Complete!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('Results:');
    console.log(`  Total migrated photos:       ${stats.totalMigratedPhotos}`);
    console.log(`  Photo records created:       ${stats.photoRecordsCreated}`);
    console.log(`  Already had Photo records:   ${stats.photosWithExistingRecords}`);
    console.log(`  PhotoProjects created:       ${stats.photoProjectsCreated}`);
    console.log(`  Skipped (no opportunity):    ${stats.skippedNoOpportunity}`);
    console.log(`  Errors:                      ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log('');
      console.log('Errors (first 20):');
      stats.errors.slice(0, 20).forEach((err, i) => {
        console.log(`  ${i + 1}. Photo ${err.companyCamId}: ${err.error}`);
      });
    }

    // Verification
    console.log('');
    console.log('Verification:');
    const totalPhotoRecords = await prisma.photo.count({
      where: { externalSource: 'COMPANYCAM' }
    });
    const totalPhotoProjects = await prisma.photoProject.count();

    console.log(`  Total Photo records (COMPANYCAM): ${totalPhotoRecords}`);
    console.log(`  Total PhotoProjects:              ${totalPhotoProjects}`);

  } catch (error) {
    console.error('Repair failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

repairPhotoRecords();
