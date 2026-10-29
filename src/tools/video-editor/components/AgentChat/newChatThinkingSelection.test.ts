// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readModelThoughtSelections, rememberModelThoughtSelection } from './newChatThinkingSelection.ts';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('New chat thinking choices', () => {
  it('keeps explicit choices separate for each agent and model', () => {
    rememberModelThoughtSelection('claude-code', 'model-a', 'low');
    rememberModelThoughtSelection('claude-code', 'model-b', 'high');
    rememberModelThoughtSelection('codex', 'model-a', 'xhigh');
    expect(readModelThoughtSelections('claude-code')).toEqual({ 'model-a': 'low', 'model-b': 'high' });
    expect(readModelThoughtSelections('codex')).toEqual({ 'model-a': 'xhigh' });
    expect(readModelThoughtSelections('astrid')).toEqual({});
  });

  it.each(['{', '[]', 'null'])('ignores damaged selection storage %s', value => {
    localStorage.setItem('astrid.app.modelThoughtSelections.codex', value);
    expect(readModelThoughtSelections('codex')).toEqual({});
  });

  it('drops non-string selections', () => {
    localStorage.setItem('astrid.app.modelThoughtSelections.codex', '{"model-a":"high","broken":42}');
    expect(readModelThoughtSelections('codex')).toEqual({ 'model-a': 'high' });
  });

  it('bounds remembered choices and moves a renewed choice to the end', () => {
    for (let index = 0; index < 50; index++) rememberModelThoughtSelection('codex', `model-${index}`, 'low');
    rememberModelThoughtSelection('codex', 'model-0', 'high');
    const next = rememberModelThoughtSelection('codex', 'model-50', 'high');
    expect(Object.keys(next)).toHaveLength(50);
    expect(next['model-1']).toBeUndefined();
    expect(Object.keys(next).slice(-2)).toEqual(['model-0', 'model-50']);
    expect(next['model-0']).toBe('high');
  });

  it('allows a blocked storage read and write', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    expect(readModelThoughtSelections('codex')).toEqual({});
    expect(rememberModelThoughtSelection('codex', 'model-a', 'high')).toEqual({ 'model-a': 'high' });
    // The choice lives in memory: a blocked storage does not lose it.
    expect(readModelThoughtSelections('codex')).toEqual({ 'model-a': 'high' });
  });
});
