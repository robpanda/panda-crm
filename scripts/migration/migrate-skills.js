#!/usr/bin/env node
// Migrate Skills and ResourceSkill (SkillRequirement) from Salesforce to PostgreSQL
// Links Skills to Service Resources (Crews)
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, disconnect } from './prisma-client.js';

async function migrateSkills() {
  console.log('Starting Skills migration...\n');

  const prisma = getPrismaClient();

  // Step 1: Migrate Skills
  console.log('='.repeat(50));
  console.log('Step 1: Migrating Skills');
  console.log('='.repeat(50));

  const skillQuery = `
    SELECT Id, MasterLabel, Description
    FROM Skill
    ORDER BY MasterLabel
  `;

  console.log('Fetching Skills from Salesforce...');
  const sfSkills = await querySalesforce(skillQuery);
  console.log(`Found ${sfSkills.length} skills`);

  const skillMap = new Map(); // SF ID -> local ID
  let skillsCreated = 0;
  let skillsSkipped = 0;

  for (const sfSkill of sfSkills) {
    // Check if skill already exists by name
    let skill = await prisma.skill.findUnique({
      where: { name: sfSkill.MasterLabel },
    });

    if (skill) {
      skillMap.set(sfSkill.Id, skill.id);
      skillsSkipped++;
      continue;
    }

    try {
      skill = await prisma.skill.create({
        data: {
          name: sfSkill.MasterLabel,
          description: sfSkill.Description || null,
        },
      });
      skillMap.set(sfSkill.Id, skill.id);
      skillsCreated++;
      console.log(`  Created skill: ${sfSkill.MasterLabel}`);
    } catch (error) {
      console.error(`  Error creating skill ${sfSkill.MasterLabel}: ${error.message}`);
    }
  }

  console.log(`\nSkills: Created ${skillsCreated}, Skipped ${skillsSkipped}`);

  // Step 2: Get Service Resources from local DB
  console.log('\n' + '='.repeat(50));
  console.log('Step 2: Loading Service Resources');
  console.log('='.repeat(50));

  const resources = await prisma.serviceResource.findMany({
    select: { id: true, salesforceId: true, name: true },
  });
  const resourceMap = new Map(resources.map(r => [r.salesforceId, r]));
  console.log(`Found ${resources.length} resources in database`);

  // Step 3: Migrate SkillRequirement (links resources to skills)
  console.log('\n' + '='.repeat(50));
  console.log('Step 3: Migrating Resource Skills (SkillRequirement)');
  console.log('='.repeat(50));

  const resourceSkillQuery = `
    SELECT Id, ServiceResourceId, SkillId, SkillLevel, EffectiveStartDate, EffectiveEndDate
    FROM ServiceResourceSkill
    ORDER BY ServiceResourceId
  `;

  console.log('Fetching ServiceResourceSkill from Salesforce...');
  const sfResourceSkills = await querySalesforce(resourceSkillQuery);
  console.log(`Found ${sfResourceSkills.length} resource skill assignments`);

  let resourceSkillsCreated = 0;
  let resourceSkillsSkipped = 0;
  let resourceSkillErrors = [];

  for (const sfResourceSkill of sfResourceSkills) {
    const resource = resourceMap.get(sfResourceSkill.ServiceResourceId);
    const localSkillId = skillMap.get(sfResourceSkill.SkillId);

    if (!resource) {
      resourceSkillsSkipped++;
      continue; // Resource not in our DB
    }

    if (!localSkillId) {
      resourceSkillsSkipped++;
      continue; // Skill not in our map
    }

    // Check if assignment already exists
    const existing = await prisma.resourceSkill.findFirst({
      where: {
        resourceId: resource.id,
        skillId: localSkillId,
      },
    });

    if (existing) {
      resourceSkillsSkipped++;
      continue;
    }

    // Map Salesforce skill level to our enum
    // SF levels: 0=None, 1=Basic, 2=Intermediate, 3=Advanced, 4=Expert
    let level = 'INTERMEDIATE';
    if (sfResourceSkill.SkillLevel !== null) {
      const levelNum = parseInt(sfResourceSkill.SkillLevel, 10);
      if (levelNum <= 1) level = 'BEGINNER';
      else if (levelNum === 2) level = 'INTERMEDIATE';
      else if (levelNum === 3) level = 'ADVANCED';
      else if (levelNum >= 4) level = 'EXPERT';
    }

    try {
      await prisma.resourceSkill.create({
        data: {
          resourceId: resource.id,
          skillId: localSkillId,
          level: level,
        },
      });
      resourceSkillsCreated++;

      if (resourceSkillsCreated % 50 === 0) {
        console.log(`  Created ${resourceSkillsCreated} resource skill assignments...`);
      }
    } catch (error) {
      resourceSkillErrors.push({ resource: resource.name, error: error.message });
    }
  }

  console.log(`\nResource Skills: Created ${resourceSkillsCreated}, Skipped ${resourceSkillsSkipped}`);

  if (resourceSkillErrors.length > 0) {
    console.log('\nErrors:');
    resourceSkillErrors.slice(0, 10).forEach(e => {
      console.log(`  - ${e.resource}: ${e.error}`);
    });
    if (resourceSkillErrors.length > 10) {
      console.log(`  ... and ${resourceSkillErrors.length - 10} more errors`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('Skill Assignment Summary');
  console.log('='.repeat(50));

  const skillCounts = await prisma.resourceSkill.groupBy({
    by: ['skillId'],
    _count: { id: true },
  });

  const allSkills = await prisma.skill.findMany();
  const skillNameMap = new Map(allSkills.map(s => [s.id, s.name]));

  for (const count of skillCounts) {
    const skillName = skillNameMap.get(count.skillId);
    console.log(`  ${skillName}: ${count._count.id} resources`);
  }

  await disconnect();
  console.log('\nSkills migration complete!');
}

migrateSkills().catch(console.error);
