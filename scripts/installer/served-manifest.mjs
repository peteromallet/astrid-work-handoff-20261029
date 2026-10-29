import { readFile } from 'node:fs/promises';
import { checkManifest } from './pin.mjs';

const fields = [
  ['agent.sha', (manifest) => manifest?.agent?.sha],
  ['runtime.sha', (manifest) => manifest?.runtime?.sha],
  ['runtime.schema_digest', (manifest) => manifest?.runtime?.schema_digest],
];
const defaultManifestPath = new URL('../../public/install-manifest.json', import.meta.url);
const servedUrl = 'https://astrid.haus/install-manifest.json';
const attempts = 7;
const requestTimeoutMs = 5_000;
const retryDelayMs = 18_000;

function display(value) {
  return value ?? '(missing)';
}

function mismatches(expected, actual, deployedSha) {
  return fields.flatMap(([name, value]) => {
    const expectedValue = value(expected);
    const actualValue = value(actual);
    if (expectedValue === actualValue) return [];
    return [`${name}: deployed ${deployedSha} public value ${display(expectedValue)}, served value ${display(actualValue)}`];
  });
}

async function readServedManifest() {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(servedUrl, {
        headers: { accept: 'application/json', 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return JSON.parse(await response.text());
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
  throw new Error(`Could not fetch a valid manifest from ${servedUrl} after ${attempts} attempts: ${lastError.message}`);
}

async function main() {
  const [deployedSha, manifestPath = defaultManifestPath] = process.argv.slice(2);
  if (!/^[0-9a-f]{40}$/.test(deployedSha ?? '')) {
    throw new Error('Usage: node scripts/installer/served-manifest.mjs <deployed-sha> [expected-manifest-path]');
  }

  const expected = JSON.parse(await readFile(manifestPath, 'utf8'));
  let lastMismatches = [];
  let lastManifest;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const actual = await readServedManifest();
    lastManifest = actual;
    lastMismatches = mismatches(expected, actual, deployedSha);
    if (lastMismatches.length === 0) {
      const coherence = await checkManifest(actual);
      process.stdout.write(`${coherence}\n`);
      process.stdout.write(`Served manifest at ${servedUrl} matches deployment ${deployedSha}.\n`);
      return;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
  let coherenceError;
  try {
    await checkManifest(lastManifest);
  } catch (error) {
    coherenceError = `C1 coherence check also failed: ${error.message}`;
  }
  const details = [...lastMismatches, ...(coherenceError ? [coherenceError] : [])];
  throw new Error(`Served manifest at ${servedUrl} did not match deployment ${deployedSha} after ${attempts} attempts:\n${details.join('\n')}`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
