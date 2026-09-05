#!/usr/bin/env node
/*
 * Writes the root manifest.json (Chrome, so the repo can be loaded unpacked
 * as-is) and assembles dist/chrome + dist/firefox packages.
 *
 * No bundler on purpose: the extension is plain scripts, and a build step that
 * can silently change behaviour is not worth it here.
 */
import { buildManifest } from './manifest.mjs';
import { zipDirectory } from './zip.mjs';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAYLOAD = ['src', 'icons'];

async function writeManifest(target, dir) {
  const manifest = buildManifest(target);
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

async function packageFor(target) {
  const dir = path.join(ROOT, 'dist', target);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const item of PAYLOAD) {
    if (existsSync(path.join(ROOT, item))) {
      await cp(path.join(ROOT, item), path.join(dir, item), { recursive: true });
    }
  }
  const manifest = await writeManifest(target, dir);
  /* Stores take a zip, so produce one alongside the unpacked folder. */
  const zipPath = path.join(ROOT, 'dist', `ai-slop-blocker-${target}-${manifest.version}.zip`);
  const { entries, bytes } = zipDirectory(dir, zipPath);
  console.log(`built dist/${target} (v${manifest.version}) -> ${path.basename(zipPath)} ` +
              `(${entries} files, ${(bytes / 1024).toFixed(0)} KB)`);
}

await writeManifest('chrome', ROOT);
console.log('wrote manifest.json (chrome, load-unpacked from repo root)');
await packageFor('chrome');
await packageFor('firefox');
await packageFor('mv2');
