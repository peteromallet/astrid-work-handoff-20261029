#!/usr/bin/env node
// Fails when a built directory names a remote font or script host. The App serves its own typography
// (src/index.css and public/fonts), so nothing in a build should point at these hosts.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REMOTE_HOSTS = Object.freeze([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'unpkg.com',
  'cdn.jsdelivr.net',
]);

function* walkFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walkFiles(full);
    else yield full;
  }
}

/** Every (file, host) pair where a file under `dir` names one of REMOTE_HOSTS. */
export function findRemoteHostReferences(dir) {
  const hits = [];
  for (const file of walkFiles(dir)) {
    const content = readFileSync(file, 'latin1');
    for (const host of REMOTE_HOSTS) {
      if (content.includes(host)) hits.push({ file: relative(dir, file), host });
    }
  }
  return hits;
}

function main(argv) {
  const [dir] = argv;
  if (!dir) {
    console.error('usage: check-no-remote-hosts.mjs <dir>');
    return 2;
  }
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`check-no-remote-hosts: ${dir} is not a directory`);
    return 2;
  }
  const hits = findRemoteHostReferences(dir);
  if (hits.length > 0) {
    console.error(`Found ${hits.length} remote font or script host reference(s) in ${dir}:`);
    for (const hit of hits) console.error(` - ${hit.file}: ${hit.host}`);
    return 1;
  }
  console.log(`No remote font or script host in ${dir}.`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
