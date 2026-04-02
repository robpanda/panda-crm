import fs from 'fs';
import path from 'path';

export function normalizePathSlashes(value) {
  return String(value || '').replace(/\\/g, '/');
}

export function normalizeHashedPath(relativePath) {
  return normalizePathSlashes(relativePath).replace(/-[A-Za-z0-9_]{8,}(?=\.[^./]+$)/g, '-[hash]');
}

export function globToRegExp(glob) {
  const normalized = normalizePathSlashes(glob);
  let pattern = '';

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === '*' && next === '*') {
      pattern += '.*';
      index += 1;
      continue;
    }

    if (char === '*') {
      pattern += '[^/]*';
      continue;
    }

    if (char === '?') {
      pattern += '.';
      continue;
    }

    if ('\\.[]{}()+-^$|'.includes(char)) {
      pattern += `\\${char}`;
      continue;
    }

    pattern += char;
  }

  return new RegExp(`^${pattern}$`);
}

export function matchesAnyGlob(value, globs = []) {
  return globs.some((glob) => globToRegExp(glob).test(normalizePathSlashes(value)));
}

export function loadAnalyticsReleasePolicy(policyPath) {
  const resolvedPath = policyPath || path.resolve('scripts/release/analytics-release-policy.json');
  return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
}

export function listFilesRecursive(rootDir) {
  const results = [];

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) {
      return;
    }

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      results.push(normalizePathSlashes(path.relative(rootDir, absolutePath)));
    }
  }

  walk(rootDir);
  return results.sort();
}

export function buildArtifactClassification(paths, policy) {
  const normalizedPaths = paths.map((relativePath) => ({
    relativePath: normalizePathSlashes(relativePath),
    normalizedPath: normalizeHashedPath(relativePath),
  }));

  return normalizedPaths.map((entry) => {
    if (matchesAnyGlob(entry.relativePath, policy.allowedOutputGlobs)) {
      return { ...entry, status: 'allowed', family: 'analytics' };
    }

    const forbiddenFamily = (policy.forbiddenOutputFamilies || []).find((family) =>
      matchesAnyGlob(entry.relativePath, family.globs || []) || matchesAnyGlob(entry.normalizedPath, family.globs || []),
    );

    return {
      ...entry,
      status: 'forbidden',
      family: forbiddenFamily?.label || 'non-analytics',
    };
  });
}

export function diffNormalizedArtifacts(basePaths, currentPaths) {
  const baseSet = new Set(basePaths.map(normalizeHashedPath));
  const currentSet = new Set(currentPaths.map(normalizeHashedPath));

  const added = [...currentSet].filter((item) => !baseSet.has(item)).sort();
  const removed = [...baseSet].filter((item) => !currentSet.has(item)).sort();

  return { added, removed };
}

export function classifySourceChanges(changedFiles, policy) {
  const normalizedFiles = changedFiles.map(normalizePathSlashes);

  const allowed = normalizedFiles.filter((relativePath) => matchesAnyGlob(relativePath, policy.allowedSourceGlobs));
  const forbidden = normalizedFiles.filter((relativePath) => !matchesAnyGlob(relativePath, policy.allowedSourceGlobs));

  return { allowed, forbidden };
}

export function summarizeArtifactBlastRadius(basePaths, currentPaths, policy) {
  const diff = diffNormalizedArtifacts(basePaths, currentPaths);
  const currentClassification = buildArtifactClassification(currentPaths, policy);
  const forbiddenCurrent = currentClassification.filter((entry) => entry.status === 'forbidden');

  return {
    diff,
    currentClassification,
    forbiddenCurrent,
    ok: forbiddenCurrent.length === 0,
  };
}
