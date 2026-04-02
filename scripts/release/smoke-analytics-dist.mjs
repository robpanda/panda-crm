#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function assertFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing expected file: ${filePath}`);
  }
}

function main() {
  const distDir = path.resolve('dist');
  const analyticsDir = path.join(distDir, 'analytics');
  const releaseManifestPath = path.join(analyticsDir, 'release-manifest.json');
  const indexHtmlPath = path.join(analyticsDir, 'index.html');

  assertFileExists(indexHtmlPath);
  assertFileExists(path.join(analyticsDir, 'manifest.json'));
  assertFileExists(releaseManifestPath);

  const releaseManifest = JSON.parse(fs.readFileSync(releaseManifestPath, 'utf8'));
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

  if (!indexHtml.includes('/analytics-assets/')) {
    throw new Error('Analytics HTML is not referencing analytics-assets.');
  }

  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error('Analytics-only build unexpectedly produced root index.html.');
  }

  for (const relativePath of releaseManifest.files || []) {
    assertFileExists(path.join(distDir, relativePath));
  }

  console.log('[analytics-smoke] OK');
}

main();
