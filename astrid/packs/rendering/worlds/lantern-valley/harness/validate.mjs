// Validates the prepared live-scene package with Astrid's TypeScript validators
// (bundled on the fly from the read-only repo) and the Python live_scenes validator.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, REPO } from '../deps.mjs';

const execFileAsync = promisify(execFile);
const SW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME_DIR = path.join(REPO, 'astrid/packs/rendering/ui/threejs-live-editor');
const PY_SHARED = path.join(REPO, 'astrid/packs/rendering/shared');
const PACKAGE = path.join(SW, 'prepared/lantern-valley.scene.json');
const CACHE = path.join(SW, '.cache');
const ENVELOPE = path.join(CACHE, 'envelope.json');
const MAX_HTML_BYTES = 8388608;
const MAX_PACKAGE_BODY = 65536;
const MANIFEST_KEYS = 'authoredFps,duration,entry,formatVersion';

const checks = {};
const check = (name, ok, detail) => {
  checks[name] = { ok: Boolean(ok), ...(detail !== undefined ? { detail } : {}) };
  if (!ok) throw new Error(`check failed: ${name}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ''}`);
};
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const sha256Text = async (text) => `sha256:${hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))}`;

// 1. Bundle the real authoring.ts / runtime.ts with a virtual entry.
async function loadTsValidators() {
  const entry = [
    "export { parsePreparedScenePackage } from './authoring.ts';",
    "export { validateScenePackage, verifyScenePackageIntegrity, sceneDocument } from './runtime.ts';",
  ].join('\n');
  const result = await build({
    stdin: { contents: entry, resolveDir: RUNTIME_DIR, sourcefile: 'virtual-entry.ts', loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
    plugins: [{
      name: 'stub-unresolved-astrid-packages',
      setup(b) {
        b.onResolve({ filter: /^@astrid\// }, (args) => ({ path: args.path, namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default {};', loader: 'js' }));
      },
    }],
  });
  const code = result.outputFiles[0].text;
  mkdirSync(CACHE, { recursive: true });
  const bundlePath = path.join(CACHE, 'validators.bundle.mjs');
  writeFileSync(bundlePath, code);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

async function main() {
  const { parsePreparedScenePackage, validateScenePackage, verifyScenePackageIntegrity, sceneDocument } =
    await loadTsValidators();

  // Parse the prepared file with the real parser.
  const fileBytes = new Uint8Array(readFileSync(PACKAGE));
  const parsed = await parsePreparedScenePackage(fileBytes);
  const raw = JSON.parse(new TextDecoder().decode(fileBytes));
  check('parser_manifest', parsed.manifest.formatVersion === 1 && parsed.manifest.entry === 'lantern-valley.html', parsed.manifest);
  check('parser_assets_empty', parsed.assets.length === 0);
  check('parser_entry_filename', parsed.entry.filename === parsed.manifest.entry, parsed.entry.filename);

  // Mirror ingestPackage: canonical packageBody with entry = {object_id, ...metadata} and assets [].
  // object_id values are synthetic (no project storage here): derived from the digest.
  const entryDigestHex = raw.entry.digest.slice('sha256:'.length);
  const entryMeta = {
    object_id: entryDigestHex,
    digest: raw.entry.digest,
    media_type: raw.entry.media_type,
    size: raw.entry.size,
    filename: raw.entry.filename,
  };
  const packageBody = JSON.stringify({ manifest: parsed.manifest, entry: entryMeta, assets: [] });
  const revision = await sha256Text(packageBody);
  const envelope = {
    revision,
    source: { objectId: revision.slice('sha256:'.length), revision },
    packageBody,
    html: parsed.entry.bytes && new TextDecoder().decode(parsed.entry.bytes),
  };
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(ENVELOPE, JSON.stringify(envelope));

  const validated = validateScenePackage(envelope);
  await verifyScenePackageIntegrity(validated);
  check('ts_validate_and_integrity', true);

  // HTML and document checks.
  const html = envelope.html;
  const htmlBytes = new TextEncoder().encode(html).byteLength;
  check('html_bytes_limit', htmlBytes <= MAX_HTML_BYTES, { htmlBytes, max: MAX_HTML_BYTES });
  const bodyBytes = new TextEncoder().encode(packageBody).byteLength;
  check('package_body_limit', bodyBytes <= MAX_PACKAGE_BODY, { bytes: bodyBytes, chars: packageBody.length, max: MAX_PACKAGE_BODY });
  check('assets_empty', Array.isArray(raw.assets) && raw.assets.length === 0);
  check('manifest_keys', Object.keys(raw.manifest).sort().join(',') === MANIFEST_KEYS, Object.keys(raw.manifest));
  check('source_single_body_close', (html.match(/<\/body>/gi) || []).length === 1, (html.match(/<\/body>/gi) || []).length);

  const doc = sceneDocument(validated, 'check');
  const bodyCloses = (doc.match(/<\/body>/gi) || []).length;
  check('doc_single_body_close', bodyCloses === 1, bodyCloses);
  const cspAfterHead = /<head[^>]*>\s*<meta http-equiv="Content-Security-Policy"/i.test(doc);
  check('csp_right_after_head', cspAfterHead);
  const bodyIdx = doc.search(/<\/body>/i);
  const bridgeBefore = doc.slice(0, bodyIdx).endsWith('</script>') && doc.slice(0, bodyIdx).includes('astrid.scene/1');
  check('bridge_before_body_close', bridgeBefore);

  // 2. Python validator.
  const py = `import sys,json; sys.path.insert(0, sys.argv[2]); from live_scenes.package import validate_package; validate_package(json.load(open(sys.argv[1]))); print('python validate_package: ok')`;
  let pyOut;
  try {
    const { stdout, stderr } = await execFileAsync('python3', ['-I', '-c', py, ENVELOPE, PY_SHARED]);
    pyOut = (stdout + stderr).trim();
  } catch (error) {
    throw new Error(`python validate_package failed: ${(error.stderr || error.stdout || error.message).toString().trim()}`);
  }
  check('python_validate_package', pyOut.includes('python validate_package: ok'), pyOut);

  return {
    ok: true,
    manifest: parsed.manifest,
    entry: { filename: parsed.entry.filename, bytes: parsed.entry.bytes.byteLength },
    revision,
    envelope: ENVELOPE,
    limits: { htmlBytes, packageBodyBytes: bodyBytes, packageBodyChars: packageBody.length },
    python: pyOut,
    checks,
  };
}

try {
  const summary = await main();
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message, checks }, null, 2));
  process.exit(1);
}
