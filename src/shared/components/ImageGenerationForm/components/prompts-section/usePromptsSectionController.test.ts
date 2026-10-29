import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePromptsSectionController } from './usePromptsSectionController';

const mocks = vi.hoisted(() => ({
  useIsMobile: vi.fn(),
  useFormUIContext: vi.fn(),
  useFormCoreContext: vi.fn(),
  useFormPromptsContext: vi.fn(),
}));

vi.mock('@/shared/hooks/mobile', () => ({
  useIsMobile: (...args: unknown[]) => mocks.useIsMobile(...args),
}));

vi.mock('../../ImageGenerationFormContext', () => ({
  useFormUIContext: (...args: unknown[]) => mocks.useFormUIContext(...args),
  useFormCoreContext: (...args: unknown[]) => mocks.useFormCoreContext(...args),
  useFormPromptsContext: (...args: unknown[]) => mocks.useFormPromptsContext(...args),
}));

describe('usePromptsSectionController', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useIsMobile.mockReturnValue(false);
    mocks.useFormUIContext.mockReturnValue({
      uiActions: {
        setPromptModalOpen: vi.fn(),
      },
    });
    mocks.useFormCoreContext.mockReturnValue({
      isGenerating: true,
      ready: true,
    });
    mocks.useFormPromptsContext.mockReturnValue({
      prompts: [{ id: 'p1', fullPrompt: 'Prompt one' }],
      actionablePromptsCount: 1,
      currentBeforePromptText: 'Before text',
      currentAfterPromptText: 'After text',
      setCurrentBeforePromptText: vi.fn(),
      setCurrentAfterPromptText: vi.fn(),
      handleResetPromptsToSingleBlank: vi.fn(),
      markAsInteracted: vi.fn(),
    });
  });

  it('clears text fields and marks interaction on clear handlers', () => {
    const { result } = renderHook(() => usePromptsSectionController());
    const promptsContext = mocks.useFormPromptsContext.mock.results[0].value;

    act(() => {
      result.current.onClearBeforeEachPromptText();
      result.current.onClearAfterEachPromptText();
    });

    expect(promptsContext.setCurrentBeforePromptText).toHaveBeenCalledWith('');
    expect(promptsContext.setCurrentAfterPromptText).toHaveBeenCalledWith('');
    expect(promptsContext.markAsInteracted).toHaveBeenCalledTimes(2);
  });

  it('opens the prompt editor modal', () => {
    const { result } = renderHook(() => usePromptsSectionController());
    const { uiActions } = mocks.useFormUIContext.mock.results[0].value;

    act(() => {
      result.current.onOpenPromptModal();
    });

    expect(uiActions.setPromptModalOpen).toHaveBeenCalledWith(true);
  });
});
