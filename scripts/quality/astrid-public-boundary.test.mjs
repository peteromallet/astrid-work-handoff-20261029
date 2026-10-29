import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commands, fixtures, redaction, validateDiagnostic, validateShared } from './lib/astrid-public-boundary.mjs';

const clone = (value) => structuredClone(value);
const healthy = () => clone(fixtures.cases.find((item) => item.id === 'status-healthy-local').expected);
const pathSet = (value, parts, next) => {
  let target = value;
  for (const part of parts.slice(0, -1)) target = target[part];
  target[parts.at(-1)] = next;
};
const errors = (diagnostic) => validateDiagnostic(diagnostic).join('\n');

// C1's projection fields (nullable refs, progress, freshness, and uncertainty) are retired by C2.
test('every pinned producer diagnostic fixture conforms, and every invalid case is rejected', () => {
  for (const item of fixtures.cases) {
    assert.deepEqual(validateDiagnostic(clone(item.expected)), [], item.id);
  }
  for (const item of fixtures.invalid) {
    const diagnostic = clone(fixtures.cases.find((candidate) => candidate.id === item.base).expected);
    for (const edit of item.edits ?? [{ path: item.path, value: item.value }]) pathSet(diagnostic, edit.path, edit.value);
    assert.notEqual(validateDiagnostic(diagnostic).length, 0, item.id);
  }
});

test('every public command keeps its exact effect sequence and authorization rule', () => {
  const diagnostic = healthy();
  diagnostic.nextActions = commands.map((command) => ({
    commandId: command.commandId,
    arguments: [],
    effects: [...command.effects],
    authorizationRequired: command.authorizationRequired,
    executable: true,
  }));
  assert.deepEqual(validateDiagnostic(diagnostic), []);
  for (const command of commands) {
    const action = diagnostic.nextActions.find((item) => item.commandId === command.commandId);
    if (command.authorizationRequired) {
      action.authorizationRequired = false;
      assert.match(errors(diagnostic), /authorization/, command.commandId);
      action.authorizationRequired = true;
    }
    action.effects = [...command.effects].reverse();
    if (command.effects.length > 1) assert.match(errors(diagnostic), /effects/, command.commandId);
    else {
      action.effects = [...command.effects, command.effects[0]];
      assert.notEqual(validateDiagnostic(diagnostic).length, 0, command.commandId);
    }
    action.effects = [...command.effects];
  }
});

test('actions reject unknown commands, malformed arguments, duplicate effects, and redacted executable values', () => {
  const diagnostic = healthy();
  diagnostic.nextActions = [{ commandId: 'runtime-status', arguments: ['--json'], effects: ['observe'], authorizationRequired: false, executable: true }];
  assert.deepEqual(validateDiagnostic(diagnostic), []);
  diagnostic.nextActions[0].commandId = 'unknown';
  assert.match(errors(diagnostic), /unknown command/);
  diagnostic.nextActions[0].commandId = 'runtime-status';
  diagnostic.nextActions[0].arguments = [42];
  assert.notEqual(validateDiagnostic(diagnostic).length, 0);
  diagnostic.nextActions[0].arguments = [];
  diagnostic.nextActions[0].flags = ['--invented'];
  assert.notEqual(validateDiagnostic(diagnostic).length, 0);
  delete diagnostic.nextActions[0].flags;
  diagnostic.nextActions[0].effects = ['observe', 'observe'];
  assert.notEqual(validateDiagnostic(diagnostic).length, 0);
  diagnostic.nextActions[0].effects = ['observe'];
  diagnostic.nextActions[0].arguments = ['<redacted:path>'];
  assert.match(errors(diagnostic), /placeholder/);
});

test('all independent facts preserve observed and unavailable semantics', () => {
  const unknown = () => clone(fixtures.cases.find((item) => item.id === 'status-unknown-local').expected);
  const names = Object.keys(unknown().facts);
  assert.equal(names.length, 13);
  for (const name of names) {
    const diagnostic = unknown();
    assert.deepEqual(validateDiagnostic(diagnostic), [], `${name}: unobserved baseline`);
    for (const [field, value] of [['value', 'inferred'], ['observedAt', '2026-09-24T12:00:00Z'], ['unavailableReason', null]]) {
      const changed = clone(diagnostic);
      changed.facts[name][field] = value;
      assert.notEqual(validateDiagnostic(changed).length, 0, `${name}: unobserved ${field}`);
    }
    const extraField = clone(diagnostic);
    extraField.facts[name].extra = true;
    assert.notEqual(validateDiagnostic(extraField).length, 0, `${name}: exact fact shape`);
    const missingField = clone(diagnostic);
    delete missingField.facts[name].observedAt;
    assert.notEqual(validateDiagnostic(missingField).length, 0, `${name}: required fact shape`);
    const observed = clone(diagnostic);
    Object.assign(observed.facts[name], { observed: true, value: 'known', observedAt: '2026-09-24T12:00:00Z', unavailableReason: null });
    assert.deepEqual(validateDiagnostic(observed), [], `${name}: observed baseline`);
    for (const [field, value] of [['value', null], ['observedAt', null], ['unavailableReason', 'not-observed']]) {
      const changed = clone(observed);
      changed.facts[name][field] = value;
      assert.notEqual(validateDiagnostic(changed).length, 0, `${name}: observed ${field}`);
    }
  }
  for (const value of [true, 3.5, 'known', null]) {
    const diagnostic = healthy();
    diagnostic.facts.runtime = { observed: true, value, observedAt: '2026-09-24T12:00:00Z', unavailableReason: null };
    if (value === null) assert.notEqual(validateDiagnostic(diagnostic).length, 0);
    else assert.deepEqual(validateDiagnostic(diagnostic), []);
  }
  const malformed = healthy();
  malformed.facts.runtime.value = Number.POSITIVE_INFINITY;
  assert.match(errors(malformed), /finite/);
  delete malformed.facts.runtime.unavailableReason;
  assert.notEqual(validateDiagnostic(malformed).length, 0);
  const missing = healthy();
  delete missing.facts.providerExecution;
  assert.notEqual(validateDiagnostic(missing).length, 0);
  const extra = healthy();
  extra.facts.inferredSettlement = clone(extra.facts.runtime);
  assert.notEqual(validateDiagnostic(extra).length, 0);
});

test('projection objects require their declared keys and primitive types', () => {
  for (const parts of [[], ['timing'], ['limits'], ['captured'], ['facts', 'runtime']]) {
    const diagnostic = healthy();
    const target = parts.reduce((value, key) => value[key], diagnostic);
    target.unexpected = true;
    assert.match(errors(diagnostic), /unknown field/, parts.join('.'));
    delete target.unexpected;
    delete target[Object.keys(target)[0]];
    assert.match(errors(diagnostic), /missing required field/, parts.join('.'));
  }
  for (const [parts, value] of [
    [['collectedAt'], 'yesterday'], [['schemaVersion'], 1], [['contractRevision'], 'C1'],
    [['timing', 'deadlineScope'], 'per-helper'], [['timing', 'timedOut'], 'false'],
    [['truncated'], 'false'], [['redacted'], 1], [['nextActions'], {}],
    [['actionsExecuted'], null], [['facts', 'runtime', 'observed'], 1],
    [['facts', 'runtime', 'value'], {}], [['facts', 'runtime', 'observedAt'], 'yesterday'],
    [['nextActions'], [{ ...commands[0], arguments: [], executable: 'true' }]],
    [['nextActions'], [{ ...commands[0], arguments: [], executable: true, authorizationRequired: 'false' }]],
  ]) {
    const diagnostic = healthy();
    pathSet(diagnostic, parts, value);
    assert.notEqual(validateDiagnostic(diagnostic).length, 0, parts.join('.'));
  }
});

test('healthy and failure codes are paired and restricted to known values', () => {
  const diagnostic = healthy();
  assert.deepEqual(validateDiagnostic(diagnostic), []);
  diagnostic.problemCode = 'runtime_unavailable';
  assert.match(errors(diagnostic), /paired/);
  diagnostic.failureBoundary = 'runtime-contact';
  assert.deepEqual(validateDiagnostic(diagnostic), []);
  diagnostic.problemCode = 'invented';
  assert.match(errors(diagnostic), /unknown normalized code/);
  diagnostic.problemCode = 'runtime_unavailable';
  diagnostic.failureBoundary = 'invented';
  assert.match(errors(diagnostic), /unknown boundary/);
});

test('deadlines, declared limits, and captured counts or bytes enforce inclusive bounds', () => {
  const diagnostic = healthy();
  assert.deepEqual(validateDiagnostic(diagnostic), []);
  diagnostic.timing.deadlineMs = 5000;
  diagnostic.timing.elapsedMs = 5000;
  for (const [limit, captured, maximum] of [
    ['maxEvents', 'events', 200], ['maxLogBytes', 'logBytes', 65536], ['maxBundleBytes', 'bundleBytes', 1048576],
  ]) {
    diagnostic.limits[limit] = maximum;
    diagnostic.captured[captured] = maximum;
    assert.deepEqual(validateDiagnostic(diagnostic), [], `${limit} inclusive maximum`);
    diagnostic.limits[limit] = maximum - 1;
    diagnostic.captured[captured] = maximum;
    assert.match(errors(diagnostic), /captured\.|declared limit/, `${captured} exceeds reduced declared limit`);
    diagnostic.limits[limit] = maximum + 1;
    diagnostic.captured[captured] = 0;
    assert.match(errors(diagnostic), /limits\./, `${limit} contract maximum`);
    diagnostic.limits[limit] = maximum;
  }
  diagnostic.timing.elapsedMs = 5001;
  assert.match(errors(diagnostic), /deadline/);
  diagnostic.timing.elapsedMs = 0;
  diagnostic.timing.deadlineMs = 5001;
  assert.match(errors(diagnostic), /deadline/);
  for (const [parts, values] of [
    [['timing', 'deadlineMs'], [0, -1, 1.5]],
    [['timing', 'elapsedMs'], [-1, 0.5]],
    ...['maxEvents', 'maxLogBytes', 'maxBundleBytes'].map((key) => [['limits', key], [-1, 0.5]]),
    ...['events', 'logBytes', 'bundleBytes'].map((key) => [['captured', key], [-1, 0.5]]),
  ]) for (const value of values) {
    const invalid = healthy();
    pathSet(invalid, parts, value);
    assert.notEqual(validateDiagnostic(invalid).length, 0, `${parts.join('.')}: ${value}`);
  }
});

test('diagnostic collection executes no actions and shared output is redacted and inert', () => {
  const diagnostic = healthy();
  diagnostic.actionsExecuted = ['runtime-up'];
  assert.match(errors(diagnostic), /must not/);
  diagnostic.actionsExecuted = [];
  diagnostic.mode = 'shared';
  assert.match(errors(diagnostic), /redacted/);
  diagnostic.redacted = true;
  assert.deepEqual(validateDiagnostic(diagnostic), []);
  const unsafe = clone(diagnostic);
  unsafe.facts.runtime.value = '/Users/person/private-workspace';
  assert.match(errors(unsafe), /sensitive material/);
  for (const unsafeValue of [
    'api_key=secret', 'client-secret: secret', 'https://example.invalid/?signature=secret',
    'https://example.invalid/?token=secret', '/private/tmp/file',
  ]) {
    assert.notEqual(validateShared({ nested: [unsafeValue] }).length, 0, unsafeValue);
  }
  assert.deepEqual(validateShared(redaction.shared), []);
  assert.notEqual(validateShared(redaction.input).length, 0);
  const sharedAction = clone(redaction.sharedAction);
  const withAction = clone(diagnostic);
  withAction.nextActions = [sharedAction];
  assert.deepEqual(validateDiagnostic(withAction), []);
  withAction.nextActions[0].executable = true;
  assert.match(errors(withAction), /inert/);
});

test('digest syntax is checked without admitting a particular contract identity', () => {
  const diagnostic = healthy();
  diagnostic.contractDigest = `sha256:${'a'.repeat(64)}`;
  assert.deepEqual(validateDiagnostic(diagnostic), []);
  diagnostic.contractDigest = 'sha256:not-a-digest';
  assert.match(errors(diagnostic), /malformed SHA-256/);
});
