import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

const mockNormalizeAndPresentError = vi.fn();

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mockNormalizeAndPresentError(...args),
}));

import { usePromptEditing } from './usePromptEditing';

function buildInitialPrompts() {
  return [
    { id: 'p1', fullPrompt: 'first prompt', shortPrompt: 'first short' },
    { id: 'p2', fullPrompt: 'second prompt', shortPrompt: '' },
  ];
}

function createScrollRef() {
  return {
    current: {
      scrollTop: 100,
      scrollHeight: 900,
      scrollTo: vi.fn(),
    },
  } as never;
}

function buildProps(overrides: Record<string, unknown> = {}) {
  let promptCounter = 0;

  return {
    isOpen: true,
    initialPrompts: buildInitialPrompts(),
    onSave: vi.fn(),
    onClose: vi.fn(),
    scrollRef: createScrollRef(),
    selectedProjectId: 'project-1',
    generatePromptId: vi.fn(() => {
      promptCounter += 1;
      return `generated-${promptCounter}`;
    }),
    ...overrides,
  };
}

beforeEach(() => {
  mockNormalizeAndPresentError.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePromptEditing', () => {
  it('supports local prompt edits/add/remove, remove-all, and final save-close', async () => {
    vi.useFakeTimers();
    const props = buildProps();

    const { result } = renderHook(() => usePromptEditing(props as never));

    act(() => {
      result.current.handlePromptFieldUpdate('p1', 'fullPrompt', 'updated prompt');
    });
    expect(result.current.internalPrompts[0].fullPrompt).toBe('updated prompt');

    act(() => {
      result.current.handleInternalRemovePrompt('p2');
    });
    expect(result.current.internalPrompts.map((prompt) => prompt.id)).toEqual(['p1']);

    act(() => {
      result.current.handleInternalAddBlankPrompt();
    });
    expect(result.current.internalPrompts).toHaveLength(2);
    expect(result.current.internalPrompts[1]).toEqual({ id: 'generated-1', fullPrompt: '', shortPrompt: '' });

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(props.scrollRef.current.scrollTo).toHaveBeenCalledWith({
      top: props.scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });

    act(() => {
      result.current.handleRemoveAllPrompts();
    });
    expect(result.current.internalPrompts).toEqual([{ id: 'generated-2', fullPrompt: '', shortPrompt: '' }]);

    act(() => {
      result.current.handleFinalSaveAndClose();
    });
    expect(props.onSave).toHaveBeenCalledWith([{ id: 'generated-2', fullPrompt: '', shortPrompt: '' }]);
    expect(props.scrollRef.current.scrollTop).toBe(0);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('autosaves changed prompts every 3s and normalizes save errors', () => {
    vi.useFakeTimers();
    const onSave = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('save failed');
      })
      .mockImplementationOnce(() => undefined);

    const props = buildProps({ onSave });
    const { result } = renderHook(() => usePromptEditing(props as never));

    act(() => {
      result.current.handlePromptFieldUpdate('p1', 'fullPrompt', 'changed once');
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(mockNormalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ context: 'PromptEditorModal', showToast: false }),
    );

    act(() => {
      result.current.handlePromptFieldUpdate('p1', 'fullPrompt', 'changed twice');
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onSave).toHaveBeenCalledTimes(2);
  });
});
