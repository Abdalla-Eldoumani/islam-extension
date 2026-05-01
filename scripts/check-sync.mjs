// Verifies that chrome/shared and firefox/shared are byte-identical to the
// repo-root /shared. Used by the pre-commit hook so a contributor cannot
// commit drift.
//
// Usage: npm run check-sync (exits 0 on match, 1 on drift)

import { readdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const sourceDir = join(repoRoot, 'shared');
const targets = [
  join(repoRoot, 'chrome', 'shared'),
  join(repoRoot, 'firefox', 'shared')
];

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

async function hashFile(path) {
  const buf = await readFile(path);
  return createHash('sha256').update(buf).digest('hex');
}

async function buildIndex(root) {
  try {
    await stat(root);
  } catch {
    return null;
  }
  const files = await listFiles(root);
  const index = new Map();
  for (const file of files) {
    const rel = relative(root, file).split('\\').join('/');
    index.set(rel, await hashFile(file));
  }
  return index;
}

const sourceIndex = await buildIndex(sourceDir);
if (!sourceIndex) {
  console.error('shared/ directory missing at repo root');
  process.exit(1);
}

let drift = 0;
for (const target of targets) {
  const targetIndex = await buildIndex(target);
  const rel = relative(repoRoot, target).split('\\').join('/');
  if (!targetIndex) {
    console.error(`${rel} missing — run npm run sync`);
    drift++;
    continue;
  }
  for (const [path, hash] of sourceIndex) {
    if (targetIndex.get(path) !== hash) {
      console.error(`${rel}/${path} drift — run npm run sync`);
      drift++;
    }
  }
  for (const path of targetIndex.keys()) {
    if (!sourceIndex.has(path)) {
      console.error(`${rel}/${path} not in shared — run npm run sync`);
      drift++;
    }
  }
}

if (drift > 0) {
  console.error(`drift detected (${drift} issue(s))`);
  process.exit(1);
}
console.log('shared/ matches both builds');
