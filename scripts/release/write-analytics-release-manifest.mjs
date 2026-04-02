#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function main() {
  const distDir = path.resolve('dist');
  const analyticsDir = path.join(distDir, 'analytics');
  const viteManifestPath = path.join(analyticsDir, 'manifest.json');
  const outputPath = path.join(analyticsDir, 'release-manifest.json');

  if (!fs.existsSync(viteManifestPath)) {
    throw new Error(`Missing Vite manifest at ${viteManifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(viteManifestPath, 'utf8'));
  const assetFiles = uniqueSorted(
    Object.values(manifest).flatMap((entry) => [
      entry.file,
      ...(entry.css || []),
      ...(entry.assets || []),
    ]),
  );

  const releaseManifest = {
    app: 'analytics',
    generatedAt: new Date().toISOString(),
    buildSha: process.env.VITE_BUILD_SHA || null,
    buildTime: process.env.VITE_BUILD_TIME || null,
    entryHtml: 'analytics/index.html',
    manifests: [
      'analytics/manifest.json',
      'analytics/release-manifest.json',
    ],
    assets: assetFiles,
    files: uniqueSorted([
      'analytics/index.html',
      'analytics/manifest.json',
      'analytics/release-manifest.json',
      ...assetFiles,
    ]),
    invalidatePaths: [
      '/analytics',
      '/analytics/',
      '/analytics/*',
      '/analytics-assets/*',
    ],
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(releaseManifest, null, 2)}\n`);
  console.log(`[analytics-release-manifest] wrote ${path.relative(process.cwd(), outputPath)}`);
}

main();
