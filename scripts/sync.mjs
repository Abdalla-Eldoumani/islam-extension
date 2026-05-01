// Copies the contents of repo-root /shared into chrome/shared and
// firefox/shared. Run after editing any file under /shared.
//
// Usage: npm run sync

import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const sourceDir = join(repoRoot, 'shared');
const targets = [
  join(repoRoot, 'chrome', 'shared'),
  join(repoRoot, 'firefox', 'shared')
];

// Agent-infra files never land in a build directory.
const SKIP_NAMES = new Set(['CLAUDE.md', '.DS_Store']);

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (SKIP_NAMES.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

async function syncOne(target) {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  const files = await listFiles(sourceDir);
  for (const file of files) {
    const rel = file.slice(sourceDir.length + 1);
    const dest = join(target, rel);
    await mkdir(dirname(dest), { recursive: true });
    const content = await readFile(file);
    await writeFile(dest, content);
  }
  return files.length;
}

const startedAt = Date.now();
for (const target of targets) {
  const count = await syncOne(target);
  const rel = target.slice(repoRoot.length + 1);
  console.log(`synced ${count} file(s) -> ${rel}`);
}
console.log(`done in ${Date.now() - startedAt}ms`);
