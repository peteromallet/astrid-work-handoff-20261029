const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const ts = require('typescript');

// Loads am-footage/volume.ts in-process (transpiled, no imports) and checks the
// footage sound level: clip-level volume first, legacy params.volume as the
// fallback, silent when neither is set, clamped to the video element's 0..1.
const source = path.resolve(__dirname, '..', '..', 'astrid', 'packs', 'astrid_motion', 'rendering', 'elements', 'effects', 'am-footage', 'volume.ts');
const {outputText} = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
});
const sandbox = {exports: {}};
new Function('module', 'exports', outputText)(sandbox, sandbox.exports);
const {footageVolume} = sandbox.exports;

test('the clip-level volume wins over the legacy param', () => {
  assert.equal(footageVolume(0.5, 0.2), 0.5);
  assert.equal(footageVolume(0, 0.8), 0, 'an explicit mute on the clip beats the param');
});

test('a missing clip volume falls back to the param', () => {
  assert.equal(footageVolume(undefined, 0.3), 0.3);
  assert.equal(footageVolume(null, 0.3), 0.3);
});

test('neither set gives silence', () => {
  assert.equal(footageVolume(undefined, undefined), 0);
  assert.equal(footageVolume(undefined, null), 0);
});

test('negative and non-finite clip volumes are ignored', () => {
  assert.equal(footageVolume(-1, 0.4), 0.4);
  assert.equal(footageVolume(Number.NaN, 0.4), 0.4);
  assert.equal(footageVolume(Infinity, 0.4), 0.4);
  assert.equal(footageVolume('0.5', 0.4), 0.4, 'a string is not a gain');
  assert.equal(footageVolume(-1, undefined), 0);
});

test('values above unity clamp to 1 (the video element cannot be louder)', () => {
  assert.equal(footageVolume(4, 0), 1);
  assert.equal(footageVolume(undefined, 2), 1);
  assert.equal(footageVolume(1, 0), 1);
});
