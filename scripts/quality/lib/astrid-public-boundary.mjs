import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const lock = JSON.parse(readFileSync(path.join(ROOT, 'config/astrid-cli-surface/vendor.lock.json'), 'utf8'));
// Resolve the bundle's public paths through the existing vendor lock. Its commit
// selects the release; neither the bundle version nor a diagnostic digest does.
function artifact(sourcePath) {
  const entry = Object.entries(lock.files).find(([, file]) => file.from === sourcePath);
  if (!entry) throw new Error(`Astrid bundle artifact is not pinned: ${sourcePath}`);
  return JSON.parse(readFileSync(path.join(ROOT, entry[0]), 'utf8'));
}
export const bundle = artifact('schemas/public-boundary/bundle.json');
export const schema = artifact(bundle.files.diagnosticSchema);
export const fixtures = artifact(bundle.files.diagnostics);
export const commands = artifact(bundle.files.commandEffects).commands;
export const redaction = artifact(bundle.files.redaction);

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const timestamp = (value) => typeof value === 'string' && DATE_TIME.test(value) && Number.isFinite(Date.parse(value));
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const sequence = (actual, expected) => Array.isArray(actual) && actual.length === expected.length
  && actual.every((value, index) => value === expected[index]);
const REDACTION_MARKER = /^(?:<redacted(?::[^>]+)?>|\[redacted(?::[^\]]+)?\])$/i;
const SENSITIVE_KEY = /(?:credential|token|secret|password|prompt|environment(?:Value)?|env|media|signed.?url|authorization|api[_-]?key|bearer|path|root)$/i;
const PRIVATE_TEXT = /(?:\/(?:private|Users|home|opt|mnt|tmp|var)\/|(?:^|[\s(])~[/\\]|file:\/\/|(?:api[_-]?key|access[_-]?token|authorization|client[_-]?secret|prompt|token|secret|password)\s*[:=]|[?&](?:sig|signature|x-amz-signature)=|Bearer\s)/i;

export function validateShared(value, location = 'diagnostic') {
  const errors = [];
  function walk(item, here, key = '') {
    if (typeof item === 'string' && !REDACTION_MARKER.test(item)
      && (SENSITIVE_KEY.test(key) || PRIVATE_TEXT.test(item))) errors.push(`${here}: shared output contains sensitive material`);
    if (Array.isArray(item)) item.forEach((child, index) => walk(child, `${here}[${index}]`, key));
    else if (object(item)) for (const [name, child] of Object.entries(item)) walk(child, `${here}.${name}`, name);
  }
  walk(value, location);
  return errors;
}

/** Consumer conformance for the pinned diagnostic projection, without actions or source admission. */
export function validateDiagnostic(diagnostic) {
  const errors = [];
  const require = (condition, message) => { if (!condition) errors.push(message); };
  function keys(value, definition, location) {
    require(object(value), `${location}: expected object`);
    if (!object(value)) return false;
    for (const key of Object.keys(value)) require(Object.hasOwn(definition.properties, key), `${location}.${key}: unknown field`);
    for (const key of definition.required) require(Object.hasOwn(value, key), `${location}.${key}: missing required field`);
    return true;
  }
  if (!keys(diagnostic, schema, 'diagnostic')) return errors;
  const properties = schema.properties;
  for (const key of ['schemaVersion', 'contractRevision']) require(diagnostic[key] === properties[key].const, `${key}: unsupported format`);
  require(typeof diagnostic.contractDigest === 'string' && new RegExp(properties.contractDigest.pattern).test(diagnostic.contractDigest), 'contractDigest: malformed SHA-256');
  require(properties.mode.enum.includes(diagnostic.mode), 'mode: expected local or shared');
  require(timestamp(diagnostic.collectedAt), 'collectedAt: expected UTC date-time');
  if (keys(diagnostic.timing, properties.timing, 'timing')) {
    const timing = diagnostic.timing;
    require(timing.deadlineScope === properties.timing.properties.deadlineScope.const, 'timing.deadlineScope: expected total deadline including all helpers');
    require(Number.isInteger(timing.deadlineMs) && timing.deadlineMs >= 1
      && timing.deadlineMs <= properties.timing.properties.deadlineMs.maximum, 'timing.deadlineMs: exceeds five-second total deadline');
    require(Number.isInteger(timing.elapsedMs) && timing.elapsedMs >= 0 && timing.elapsedMs <= timing.deadlineMs,
      'timing.elapsedMs: exceeds total deadline');
    require(typeof timing.timedOut === 'boolean', 'timing.timedOut: expected boolean');
  }
  require((diagnostic.problemCode === null) === (diagnostic.failureBoundary === null), 'problemCode/failureBoundary: must be paired');
  require(properties.problemCode.enum.includes(diagnostic.problemCode), 'problemCode: unknown normalized code');
  require(properties.failureBoundary.enum.includes(diagnostic.failureBoundary), 'failureBoundary: unknown boundary');
  if (keys(diagnostic.facts, properties.facts, 'facts')) {
    for (const name of properties.facts.required) {
      const fact = diagnostic.facts[name];
      if (!keys(fact, schema.$defs.fact, `facts.${name}`)) continue;
      require(typeof fact.observed === 'boolean', `facts.${name}.observed: expected boolean`);
      require(fact.value === null || typeof fact.value === 'string' || typeof fact.value === 'boolean'
        || (typeof fact.value === 'number' && Number.isFinite(fact.value)), `facts.${name}.value: expected primitive finite value or null`);
      if (fact.observed) {
        require(fact.value !== null && fact.value !== undefined, `facts.${name}: observed fact requires value`);
        require(timestamp(fact.observedAt), `facts.${name}: observed fact requires timestamp`);
        require(fact.unavailableReason === null, `facts.${name}: observed fact cannot have unavailableReason`);
      } else {
        require(fact.value === null && fact.observedAt === null, `facts.${name}: unobserved fact must preserve null value/timestamp`);
        require(typeof fact.unavailableReason === 'string' && fact.unavailableReason.trim().length > 0, `facts.${name}: unobserved fact requires unavailableReason`);
      }
    }
  }
  const limitsValid = keys(diagnostic.limits, properties.limits, 'limits');
  const capturedValid = keys(diagnostic.captured, properties.captured, 'captured');
  if (limitsValid) for (const [key, definition] of Object.entries(properties.limits.properties)) {
    require(Number.isInteger(diagnostic.limits[key]) && diagnostic.limits[key] >= definition.minimum
      && diagnostic.limits[key] <= definition.maximum, `limits.${key}: exceeds contract bound`);
  }
  if (capturedValid) for (const [captured, limit] of [['events', 'maxEvents'], ['logBytes', 'maxLogBytes'], ['bundleBytes', 'maxBundleBytes']]) {
    require(Number.isInteger(diagnostic.captured[captured]) && diagnostic.captured[captured] >= 0
      && limitsValid && diagnostic.captured[captured] <= diagnostic.limits[limit], `captured.${captured}: exceeds declared limit`);
  }
  require(typeof diagnostic.truncated === 'boolean', 'truncated: expected boolean');
  require(Array.isArray(diagnostic.nextActions), 'nextActions: expected array');
  for (const [index, action] of (Array.isArray(diagnostic.nextActions) ? diagnostic.nextActions : []).entries()) {
    const location = `nextActions[${index}]`;
    if (!keys(action, schema.$defs.action, location)) continue;
    const command = commands.find((entry) => entry.commandId === action.commandId);
    require(command !== undefined, `${location}.commandId: unknown command`);
    if (command) require(sequence(action.effects, command.effects), `${location}.effects: must exactly match command effects`);
    require(Array.isArray(action.arguments) && action.arguments.every((arg) => typeof arg === 'string'), `${location}.arguments: expected strings`);
    require(typeof action.authorizationRequired === 'boolean', `${location}.authorizationRequired: expected boolean`);
    require(typeof action.executable === 'boolean', `${location}.executable: expected boolean`);
    if (command?.authorizationRequired || (Array.isArray(action.effects) && action.effects.some((effect) => effect !== 'observe'))) {
      require(action.authorizationRequired === true, `${location}: effectful suggestion requires authorization`);
    }
    if (Array.isArray(action.arguments) && action.arguments.some((arg) => typeof arg === 'string' && /<redacted|\[redacted/i.test(arg))) {
      require(action.executable === false, `${location}: redacted placeholder must be inert`);
    }
    if (diagnostic.mode === 'shared') require(action.executable === false, `${location}: shared suggestion must be inert`);
  }
  require(Array.isArray(diagnostic.actionsExecuted) && diagnostic.actionsExecuted.length === 0,
    'actionsExecuted: diagnostic collection must not start, repair, upload, spend, or execute actions');
  require(typeof diagnostic.redacted === 'boolean', 'redacted: expected boolean');
  if (diagnostic.mode === 'shared') {
    require(diagnostic.redacted === true, 'redacted: shared diagnostic must be redacted');
    errors.push(...validateShared(diagnostic));
  } else if (diagnostic.mode === 'local') require(diagnostic.redacted === false, 'redacted: local diagnostic must not claim shared redaction');
  return errors;
}
