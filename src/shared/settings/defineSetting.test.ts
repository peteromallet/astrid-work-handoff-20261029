import { describe, expect, it } from 'vitest';
import { newChatChoice, disabledBuiltInExtensions, editorPreferences, skyPreviewEnvironment, tasksPaneExpandedHalf, tasksPaneLocked } from './declarations';
import { defineSetting, runtimeKeyPart, validatorFor } from './defineSetting';

const TIMELINE_ID = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';

describe('key mapping', () => {
  it('maps the first id segment to the Runtime group and the rest to the field', () => {
    expect(tasksPaneLocked.ref().group).toBe('ui.panes');
    expect(tasksPaneLocked.ref().field).toBe('tasks.locked');
    expect(disabledBuiltInExtensions.ref().group).toBe('ui.extensions');
    expect(disabledBuiltInExtensions.ref().field).toBe('disabled');
  });

  it('puts a single-segment id in ui.preferences', () => {
    const declaration = defineSetting({ id: 'densityTest', default: 1, scope: 'user' });
    expect(declaration.ref().group).toBe('ui.preferences');
    expect(declaration.ref().field).toBe('densityTest');
  });

  it('keeps the whole id as the field for timeline scope, under ui.timeline.<id>', () => {
    const ref = editorPreferences.ref(TIMELINE_ID);
    expect(ref.group).toBe(`ui.timeline.${TIMELINE_ID}`);
    expect(ref.field).toBe('timeline.preferences');
  });

  it('truncates a timeline group to 64 characters', () => {
    expect(editorPreferences.ref(`${'A'.repeat(80)}`).group).toHaveLength(64);
  });

  it('builds the legacy key of a timeline setting from the timeline id', () => {
    expect(editorPreferences.ref(TIMELINE_ID).legacyKey).toBe(`video-editor:preferences:${TIMELINE_ID}`);
    expect(tasksPaneLocked.ref().legacyKey).toBe('astrid.tasks-pane-locked.v1');
  });

  it('uses the device key for device scope, or a namespaced default', () => {
    const ref = skyPreviewEnvironment.ref();
    expect(ref.device).toBe(true);
    expect(ref.group).toBe('device');
    expect(ref.field).toBe('theme-include-environment');

    const fallback = defineSetting({ id: 'device.fallbackTest', default: 1, scope: 'device' }).ref();
    expect(fallback.field).toBe('astrid.setting.device.fallbackTest');
  });

  it('returns the same declaration for the same id and scope, and the same ref for the same scope id', () => {
    expect(defineSetting({ id: 'panes.tasks.locked', default: null, scope: 'user' })).toBe(tasksPaneLocked);
    expect(tasksPaneLocked.ref()).toBe(tasksPaneLocked.ref());
    expect(editorPreferences.ref(TIMELINE_ID)).toBe(editorPreferences.ref(TIMELINE_ID));
  });
});

describe('validation', () => {
  it('accepts only the declared type of the default', () => {
    expect(tasksPaneLocked.ref().validate(true)).toBe(true);
    expect(tasksPaneLocked.ref().validate('true')).toBe(false);
    expect(disabledBuiltInExtensions.ref().validate(['a'])).toBe(true);
    expect(disabledBuiltInExtensions.ref().validate({})).toBe(false);
  });

  it('uses the custom validator when one is declared', () => {
    expect(tasksPaneExpandedHalf.ref().validate('split')).toBe(true);
    expect(tasksPaneExpandedHalf.ref().validate('tasks')).toBe(false);
    expect(newChatChoice.ref().validate(null)).toBe(true);
    expect(newChatChoice.ref().validate({ agent: 'x' })).toBe(true);
    expect(newChatChoice.ref().validate([])).toBe(false);
  });

  it('maps legacy strings for expandedHalf, and ignores unknown values', () => {
    const parse = tasksPaneExpandedHalf.ref().legacyParse!;
    expect(parse('split')).toBe('split');
    expect(parse('tasks')).toBe('split');
    expect(parse('pinned')).toBe('chat');
  });
});

describe('validatorFor', () => {
  it('rejects non-finite numbers and accepts only null for a null sample', () => {
    const number = validatorFor(1);
    expect(number(2.5)).toBe(true);
    expect(number(Number.NaN)).toBe(false);
    expect(number(Infinity)).toBe(false);
    expect(number('1')).toBe(false);
    expect(validatorFor(null)(null)).toBe(true);
    expect(validatorFor(null)(0)).toBe(false);
  });

  it('separates arrays and plain objects', () => {
    expect(validatorFor([])([1])).toBe(true);
    expect(validatorFor([])({})).toBe(false);
    expect(validatorFor({})({ a: 1 })).toBe(true);
    expect(validatorFor({})([])).toBe(false);
    expect(validatorFor({})(null)).toBe(false);
  });
});

describe('runtimeKeyPart', () => {
  it('lowercases and replaces characters outside a-z, 0-9, dot, dash and underscore', () => {
    expect(runtimeKeyPart('My Ext/Name_1.v2')).toBe('my-ext-name_1.v2');
  });
});
