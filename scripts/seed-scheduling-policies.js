#!/usr/bin/env node
/**
 * Seed Scheduling Policies for FSL-equivalent functionality
 * Creates default policies matching Salesforce FSL scheduling behavior
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_POLICIES = [
  {
    name: 'Panda Standard',
    description: 'Default scheduling policy for Panda Exteriors - balanced optimization for residential jobs',
    isDefault: true,
    isActive: true,
    weightCustomerPreference: 80,
    weightSkillMatch: 90,
    weightTravelDistance: 70,
    weightResourceUtilization: 60,
    weightSameDayCompletion: 50,
    weightPriority: 85,
    requireExactSkillMatch: false,
    requireSameTerritory: true,
    allowOvertimeScheduling: false,
    maxTravelTimeMinutes: 60,
    maxAppointmentsPerDay: 8,
    minBufferMinutes: 15,
  },
  {
    name: 'Emergency Response',
    description: 'Policy for emergency/urgent appointments - prioritizes speed over travel efficiency',
    isDefault: false,
    isActive: true,
    weightCustomerPreference: 50,
    weightSkillMatch: 100,
    weightTravelDistance: 30,
    weightResourceUtilization: 40,
    weightSameDayCompletion: 95,
    weightPriority: 100,
    requireExactSkillMatch: true,
    requireSameTerritory: false, // Allow cross-territory for emergencies
    allowOvertimeScheduling: true,
    maxTravelTimeMinutes: 120, // Allow longer travel for emergencies
    maxAppointmentsPerDay: 10,
    minBufferMinutes: 10,
  },
  {
    name: 'Efficiency First',
    description: 'Optimizes for minimal travel and maximum resource utilization',
    isDefault: false,
    isActive: true,
    weightCustomerPreference: 60,
    weightSkillMatch: 80,
    weightTravelDistance: 100,
    weightResourceUtilization: 90,
    weightSameDayCompletion: 40,
    weightPriority: 70,
    requireExactSkillMatch: false,
    requireSameTerritory: true,
    allowOvertimeScheduling: false,
    maxTravelTimeMinutes: 45, // Stricter travel limit
    maxAppointmentsPerDay: 10, // More appointments per day
    minBufferMinutes: 10,
  },
  {
    name: 'Customer Priority',
    description: 'Prioritizes customer preferences and satisfaction over operational efficiency',
    isDefault: false,
    isActive: true,
    weightCustomerPreference: 100,
    weightSkillMatch: 85,
    weightTravelDistance: 50,
    weightResourceUtilization: 40,
    weightSameDayCompletion: 70,
    weightPriority: 90,
    requireExactSkillMatch: false,
    requireSameTerritory: false, // Flexible territory assignment
    allowOvertimeScheduling: true,
    maxTravelTimeMinutes: 90,
    maxAppointmentsPerDay: 6, // Fewer appointments for better service
    minBufferMinutes: 30, // More buffer time
  },
  {
    name: 'Insurance Jobs',
    description: 'Policy for insurance-related appointments with skill requirements',
    isDefault: false,
    isActive: true,
    weightCustomerPreference: 75,
    weightSkillMatch: 95, // High skill match for insurance documentation
    weightTravelDistance: 65,
    weightResourceUtilization: 55,
    weightSameDayCompletion: 45,
    weightPriority: 80,
    requireExactSkillMatch: true, // Must have insurance certification
    requireSameTerritory: true,
    allowOvertimeScheduling: false,
    maxTravelTimeMinutes: 60,
    maxAppointmentsPerDay: 6, // Insurance jobs take longer
    minBufferMinutes: 20,
  },
];

async function seedSchedulingPolicies() {
  console.log('Seeding scheduling policies...\n');

  for (const policy of DEFAULT_POLICIES) {
    try {
      const existing = await prisma.schedulingPolicy.findUnique({
        where: { name: policy.name },
      });

      if (existing) {
        console.log(`  Policy "${policy.name}" already exists, updating...`);
        await prisma.schedulingPolicy.update({
          where: { name: policy.name },
          data: policy,
        });
      } else {
        console.log(`  Creating policy: ${policy.name}`);
        await prisma.schedulingPolicy.create({
          data: policy,
        });
      }
    } catch (error) {
      console.error(`  Error creating policy ${policy.name}:`, error.message);
    }
  }

  // Verify
  const policies = await prisma.schedulingPolicy.findMany({
    orderBy: { name: 'asc' },
  });

  console.log('\n='.repeat(50));
  console.log('Scheduling Policies Summary');
  console.log('='.repeat(50));
  console.log(`Total policies: ${policies.length}`);
  console.log(`Active: ${policies.filter(p => p.isActive).length}`);
  console.log(`Default: ${policies.find(p => p.isDefault)?.name || 'None'}\n`);

  for (const p of policies) {
    console.log(`  ${p.isDefault ? '★' : ' '} ${p.name} ${p.isActive ? '(Active)' : '(Inactive)'}`);
    console.log(`    Skills: ${p.weightSkillMatch}, Travel: ${p.weightTravelDistance}, Customer: ${p.weightCustomerPreference}`);
    console.log(`    Max Travel: ${p.maxTravelTimeMinutes}min, Max Appointments: ${p.maxAppointmentsPerDay}/day`);
    console.log('');
  }

  await prisma.$disconnect();
  console.log('Scheduling policies seeded successfully!');
}

seedSchedulingPolicies().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
