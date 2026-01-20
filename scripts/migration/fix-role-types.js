#!/usr/bin/env node
// Fix role types for all roles in the database
import { getPrismaClient, disconnect } from './prisma-client.js';

function getRoleType(roleName) {
  if (!roleName) return 'sales_rep';
  const lower = roleName.toLowerCase();

  if (lower.includes('ceo') || lower.includes('admin')) return 'admin';
  if (lower.includes('president') || lower.includes('executive') || lower.includes('vp ') || lower === 'vp') return 'executive';
  if (lower.includes('vice president')) return 'executive';
  if (lower.includes('director')) return 'executive';
  if (lower.includes('office manager') || lower.includes('regional manager')) return 'office_manager';
  if (lower.includes('sales manager')) return 'sales_manager';
  if (lower.includes('project manager') || lower.includes('production manager')) return 'project_manager';
  if (lower.includes('call center')) return 'call_center';
  if (lower.includes('viewer') || lower.includes('read only')) return 'viewer';
  return 'sales_rep';
}

async function updateRoleTypes() {
  const prisma = getPrismaClient();

  const roles = await prisma.role.findMany();
  console.log('Updating', roles.length, 'roles with roleType...\n');

  const counts = {};

  for (const role of roles) {
    const roleType = getRoleType(role.name);
    counts[roleType] = (counts[roleType] || 0) + 1;

    await prisma.role.update({
      where: { id: role.id },
      data: { roleType }
    });
    console.log(`  ${role.name} -> ${roleType}`);
  }

  console.log('\n=== Role Type Distribution ===');
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

  console.log('\nDone!');
  await disconnect();
}

updateRoleTypes().catch(console.error);
