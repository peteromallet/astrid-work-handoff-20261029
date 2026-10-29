import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSubmissionOrchestrator } from '../useSubmissionOrchestrator';
import type { PromptEntry } from '../../../types';

function buildPrompt(id: string, fullPrompt: string): PromptEntry {
  return { id, fullPrompt, shortPrompt: '' };
}

describe('useSubmissionOrchestrator', () => {
  it('submitManaged shows the submit button state, queues one placeholder task, and generates from the prompts as typed', async () => {
    const prompts = [buildPrompt('prompt-1', 'A cinematic shot'), buildPrompt('prompt-2', '')];
    const taskParams = { task: true };
    const getTaskParams = vi.fn().mockReturnValue(taskParams);
    const onGenerate = vi.fn().mockResolvedValue(['task-1']);
    const trigger = vi.fn();
    const runIncomingTask = vi.fn();

    const { result } = renderHook(() => useSubmissionOrchestrator({
      context: { prompts, imagesPerPrompt: 3, actionablePromptsCount: 1 },
      effects: {
        automatedSubmitButton: { trigger, isSubmitting: false, isSuccess: false },
        onGenerate,
        getTaskParams,
        runIncomingTask,
      },
    }));

    result.current.submitManaged();

    expect(getTaskParams).toHaveBeenCalledWith(prompts);
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(runIncomingTask).toHaveBeenCalledWith(expect.objectContaining({
      label: 'A cinematic shot',
      expectedCount: 3,
      context: 'useFormSubmission.submitManaged',
    }));

    const options = runIncomingTask.mock.calls[0][0] as { execute: () => Promise<string[] | void> };
    await expect(options.execute()).resolves.toEqual(['task-1']);
    expect(onGenerate).toHaveBeenCalledWith(taskParams);
  });

  it('submitManaged does nothing when task params are rejected', () => {
    const trigger = vi.fn();
    const runIncomingTask = vi.fn();

    const { result } = renderHook(() => useSubmissionOrchestrator({
      context: { prompts: [], imagesPerPrompt: 1, actionablePromptsCount: 0 },
      effects: {
        automatedSubmitButton: { trigger, isSubmitting: false, isSuccess: false },
        onGenerate: vi.fn(),
        getTaskParams: vi.fn().mockReturnValue(null),
        runIncomingTask,
      },
    }));

    result.current.submitManaged();

    expect(trigger).not.toHaveBeenCalled();
    expect(runIncomingTask).not.toHaveBeenCalled();
  });
});
