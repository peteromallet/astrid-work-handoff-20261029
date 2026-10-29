import { useCallback, useMemo } from 'react';
import type { PromptEntry } from '../../types';
import type { PromptManagementInput, PromptRoutingResult } from './types';
import { usePromptTextRouting } from './usePromptTextRouting';

type PromptRoutingInput = Pick<
  PromptManagementInput,
  | 'associatedShotId'
  | 'shotPromptSettings'
  | 'noShotPrompts'
  | 'setNoShotPrompts'
  | 'beforeEachPromptText'
  | 'setBeforeEachPromptText'
  | 'afterEachPromptText'
  | 'setAfterEachPromptText'
  | 'markAsInteracted'
> & {
  isShotSettingsReady: boolean;
};

export function usePromptRouting(input: PromptRoutingInput): PromptRoutingResult {
  const {
    associatedShotId,
    isShotSettingsReady,
    shotPromptSettings,
    noShotPrompts,
    setNoShotPrompts,
    beforeEachPromptText,
    setBeforeEachPromptText,
    afterEachPromptText,
    setAfterEachPromptText,
    markAsInteracted,
  } = input;

  const prompts = useMemo(() => {
    if (!associatedShotId) {
      return noShotPrompts;
    }

    return isShotSettingsReady ? shotPromptSettings.settings.prompts || [] : [];
  }, [associatedShotId, isShotSettingsReady, shotPromptSettings.settings.prompts, noShotPrompts]);

  const setPrompts = useCallback(
    (newPrompts: PromptEntry[] | ((prev: PromptEntry[]) => PromptEntry[])) => {
      if (associatedShotId) {
        const currentPrompts = shotPromptSettings.settings.prompts || [];
        const updatedPrompts =
          typeof newPrompts === 'function' ? newPrompts(currentPrompts) : newPrompts;

        shotPromptSettings.updateField('prompts', updatedPrompts);
        markAsInteracted();
        return;
      }

      setNoShotPrompts((prev) =>
        typeof newPrompts === 'function' ? newPrompts(prev) : newPrompts
      );
      markAsInteracted();
    },
    [associatedShotId, shotPromptSettings, markAsInteracted, setNoShotPrompts]
  );

  const {
    currentBeforePromptText,
    setCurrentBeforePromptText,
    currentAfterPromptText,
    setCurrentAfterPromptText,
  } = usePromptTextRouting({
    associatedShotId,
    isShotSettingsReady,
    shotPromptSettings,
    beforeEachPromptText,
    setBeforeEachPromptText,
    afterEachPromptText,
    setAfterEachPromptText,
    markAsInteracted,
  });

  return {
    prompts,
    setPrompts,
    currentBeforePromptText,
    setCurrentBeforePromptText,
    currentAfterPromptText,
    setCurrentAfterPromptText,
  };
}
