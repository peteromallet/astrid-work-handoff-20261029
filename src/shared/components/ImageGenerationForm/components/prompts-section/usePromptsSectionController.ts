import React, { useCallback } from 'react';
import { useIsMobile } from '@/shared/hooks/mobile';
import {
  useFormCoreContext,
  useFormPromptsContext,
  useFormUIContext,
} from '../../ImageGenerationFormContext';

interface PromptsSectionController {
  actionablePromptsCount: number;
  afterEachPromptText: string;
  beforeEachPromptText: string;
  handleResetPromptsToSingleBlank: () => void;
  isGenerating: boolean;
  isMobile: boolean;
  prompts: Array<{ id: string; fullPrompt: string; shortPrompt?: string; active?: boolean }>;
  ready: boolean;
  onAfterEachPromptTextChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onBeforeEachPromptTextChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onClearAfterEachPromptText: () => void;
  onClearBeforeEachPromptText: () => void;
  onOpenPromptModal: () => void;
}

export const usePromptsSectionController = (): PromptsSectionController => {
  const { uiActions } = useFormUIContext();
  const { isGenerating, ready } = useFormCoreContext();
  const {
    prompts,
    actionablePromptsCount,
    currentBeforePromptText: beforeEachPromptText,
    currentAfterPromptText: afterEachPromptText,
    setCurrentBeforePromptText,
    setCurrentAfterPromptText,
    handleResetPromptsToSingleBlank,
    markAsInteracted,
  } = useFormPromptsContext();

  const isMobile = useIsMobile();

  const onBeforeEachPromptTextChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCurrentBeforePromptText(event.target.value);
  }, [setCurrentBeforePromptText]);

  const onAfterEachPromptTextChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCurrentAfterPromptText(event.target.value);
  }, [setCurrentAfterPromptText]);

  const onClearBeforeEachPromptText = useCallback(() => {
    markAsInteracted();
    setCurrentBeforePromptText('');
  }, [markAsInteracted, setCurrentBeforePromptText]);

  const onClearAfterEachPromptText = useCallback(() => {
    markAsInteracted();
    setCurrentAfterPromptText('');
  }, [markAsInteracted, setCurrentAfterPromptText]);

  const onOpenPromptModal = useCallback(() => {
    uiActions.setPromptModalOpen(true);
  }, [uiActions]);

  return {
    actionablePromptsCount,
    afterEachPromptText,
    beforeEachPromptText,
    handleResetPromptsToSingleBlank,
    isGenerating,
    isMobile,
    prompts,
    ready,
    onAfterEachPromptTextChange,
    onBeforeEachPromptTextChange,
    onClearAfterEachPromptText,
    onClearBeforeEachPromptText,
    onOpenPromptModal,
  };
};
