import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getStoredPromptCount } from './storedPromptCount';

interface PromptPersistenceInput {
  ready: boolean;
  promptsLength: number;
  effectiveShotId: string;
  setLastKnownPromptCount: Dispatch<SetStateAction<number>>;
}

export function usePromptPersistenceEffects(input: PromptPersistenceInput): void {
  const {
    ready,
    promptsLength,
    effectiveShotId,
    setLastKnownPromptCount,
  } = input;

  // Sync prompt count with sessionStorage: read on shot change, write when prompts change
  useEffect(() => {
    if (!ready || promptsLength <= 0) {
      // Not ready yet — read the last known count from storage
      setLastKnownPromptCount(getStoredPromptCount(effectiveShotId));
      return;
    }

    try {
      if (typeof window !== 'undefined') {
        const storageKey = `ig:lastPromptCount:${effectiveShotId}`;
        window.sessionStorage.setItem(storageKey, promptsLength.toString());
        window.sessionStorage.setItem('ig:lastPromptCount', promptsLength.toString());
        setLastKnownPromptCount(promptsLength);
      }
    } catch {
      // Ignore sessionStorage errors.
    }
  }, [ready, promptsLength, effectiveShotId, setLastKnownPromptCount]);
}
