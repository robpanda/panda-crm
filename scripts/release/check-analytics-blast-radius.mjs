#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  classifySourceChanges,
  listFilesRecursive,
  loadAnalyticsReleasePolicy,
  summarizeArtifactBlastRadius,
} from './analytics-release-lib.mjs';

function parseArgs(argv) {
  const args = {
    baseRef: 'origin/main',
    currentDist: null,
    skipCurrentBuild: false,
    keepTemp: false,
    policyPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--base-ref') {
      args.baseRef = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === '--current-dist') {
      args.currentDist = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === '--skip-current-build') {
      args.skipCurrentBuild = true;
      continue;
    }

    if (value === '--keep-temp') {
      args.keepTemp = true;
      continue;
    }

    if (value === '--policy') {
      args.policyPath = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    stdio: options.stdio || 'pipe',
    cwd: options.cwd,
    encoding: options.encoding || 'utf8',
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });
}

function createBaseCheckout(repoRoot, baseRef) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-crm-analytics-base-'));
  const checkoutDir = path.join(tempRoot, 'checkout');

  try {
    run('git', ['worktree', 'add', '--detach', checkoutDir, baseRef], { cwd: repoRoot });
    return { tempRoot, checkoutDir };
  } catch (worktreeError) {
    run('git', ['clone', '--quiet', repoRoot, checkoutDir], { cwd: repoRoot });
    run('git', ['checkout', '--quiet', baseRef], { cwd: checkoutDir });
    return { tempRoot, checkoutDir };
  }
}

function buildAnalyticsApp(repoRoot, checkoutDir) {
  const frontendDir = path.join(checkoutDir, 'frontend');
  const packageJsonPath = path.join(frontendDir, 'package.json');
  const analyticsConfigPath = path.join(frontendDir, 'vite.analytics.config.js');

  if (!fs.existsSync(packageJsonPath) || !fs.existsSync(analyticsConfigPath)) {
    return null;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (!packageJson?.scripts?.['build:analytics']) {
    return null;
  }

  run('npm', ['ci'], { cwd: frontendDir, stdio: 'inherit' });
  run('npm', ['run', 'build:analytics'], { cwd: frontendDir, stdio: 'inherit' });
  return path.join(frontendDir, 'dist');
}

function ensureCleanWorkingTree(repoRoot) {
  const status = run('git', ['status', '--porcelain'], { cwd: repoRoot });
  if (status.trim().length > 0 && !process.env.ALLOW_DIRTY_RELEASE) {
    throw new Error('Working tree is dirty. Commit/stash changes or set ALLOW_DIRTY_RELEASE=1.');
  }
}

function getChangedFiles(repoRoot, baseRef) {
  const output = run('git', ['diff', '--name-only', `${baseRef}...HEAD`], { cwd: repoRoot });
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function relativeDistFiles(distDir) {
  return listFilesRecursive(distDir);
}

function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../..');
  const args = parseArgs(process.argv.slice(2));
  const policy = loadAnalyticsReleasePolicy(
    args.policyPath ? path.resolve(process.cwd(), args.policyPath) : path.join(scriptDir, 'analytics-release-policy.json'),
  );

  ensureCleanWorkingTree(repoRoot);

  const currentDist = args.currentDist
    ? path.resolve(process.cwd(), args.currentDist)
    : path.join(repoRoot, 'frontend', 'dist');

  if (!args.skipCurrentBuild) {
    buildAnalyticsApp(repoRoot, repoRoot);
  }

  const currentPaths = relativeDistFiles(currentDist);
  if (currentPaths.length === 0) {
    throw new Error(`No analytics build artifacts found in ${currentDist}`);
  }

  const { tempRoot, checkoutDir } = createBaseCheckout(repoRoot, args.baseRef);

  try {
    const baseDist = buildAnalyticsApp(repoRoot, checkoutDir);
    const basePaths = baseDist ? relativeDistFiles(baseDist) : [];
    const artifactSummary = summarizeArtifactBlastRadius(basePaths, currentPaths, policy);
    const changedFiles = getChangedFiles(repoRoot, args.baseRef);
    const sourceSummary = classifySourceChanges(changedFiles, policy);

    console.log('[analytics-blast-radius] base ref:', args.baseRef);
    console.log('[analytics-blast-radius] current artifacts:', currentPaths.length);
    console.log('[analytics-blast-radius] base artifacts:', basePaths.length);
    if (!baseDist) {
      console.log('[analytics-blast-radius] base ref has no analytics build; treating as empty baseline');
    }

    if (artifactSummary.diff.added.length > 0 || artifactSummary.diff.removed.length > 0) {
      console.error('[analytics-blast-radius] normalized artifact diff detected:');
      if (artifactSummary.diff.added.length > 0) {
        console.error('  added:', artifactSummary.diff.added.join(', '));
      }
      if (artifactSummary.diff.removed.length > 0) {
        console.error('  removed:', artifactSummary.diff.removed.join(', '));
      }
    }

    if (artifactSummary.forbiddenCurrent.length > 0) {
      console.error('[analytics-blast-radius] forbidden current artifacts detected:');
      for (const entry of artifactSummary.forbiddenCurrent) {
        console.error(`  ${entry.relativePath} (${entry.family})`);
      }
    }

    if (sourceSummary.forbidden.length > 0) {
      console.error('[analytics-blast-radius] non-analytics source changes detected:');
      for (const relativePath of sourceSummary.forbidden) {
        console.error(`  ${relativePath}`);
      }
    }

    if (!artifactSummary.ok || sourceSummary.forbidden.length > 0) {
      process.exitCode = 1;
      return;
    }

    console.log('[analytics-blast-radius] OK');
  } finally {
    if (!args.keepTemp && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
}

main();
