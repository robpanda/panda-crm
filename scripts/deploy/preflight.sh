#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT_DIR"

if [ -n "${ALLOW_DIRTY_DEPLOY:-}" ]; then
  echo "[preflight] ALLOW_DIRTY_DEPLOY set; skipping clean-tree check"
else
  if [ -n "$(git status --porcelain)" ]; then
    echo "[preflight] ERROR: working tree is dirty. Commit/stash changes or set ALLOW_DIRTY_DEPLOY=1 to override." >&2
    git status --short >&2
    exit 1
  fi
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)

git fetch origin "$BRANCH" >/dev/null 2>&1 || true

if git rev-parse --verify -q "origin/$BRANCH" >/dev/null; then
  if ! git merge-base --is-ancestor HEAD "origin/$BRANCH"; then
    echo "[preflight] ERROR: local HEAD is not contained in origin/$BRANCH. Push or rebase before deploying." >&2
    exit 1
  fi
else
  echo "[preflight] WARN: origin/$BRANCH not found. Skipping remote ancestry check." >&2
fi

echo "[preflight] OK"
