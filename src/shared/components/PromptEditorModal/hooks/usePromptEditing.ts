import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { PromptEntry } from '@/shared/components/ImageGenerationForm/types';

interface UsePromptEditingParams {
  isOpen: boolean;
  initialPrompts: PromptEntry[];
  onSave: (updatedPrompts: PromptEntry[]) => void;
  onClose: () => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  selectedProjectId: string | null;
  generatePromptId: () => string;
}

export function usePromptEditing({
  isOpen,
  initialPrompts,
  onSave,
  onClose,
  scrollRef,
  selectedProjectId,
  generatePromptId,
}: UsePromptEditingParams) {
  const [internalPrompts, setInternalPrompts] = useState<PromptEntry[]>(() =>
    initialPrompts.map((prompt) => ({ ...prompt })),
  );

  const internalPromptsRef = useRef<PromptEntry[]>([]);
  useEffect(() => {
    internalPromptsRef.current = internalPrompts;
  }, [internalPrompts]);

  const currentPromptsSignature = useMemo(() => JSON.stringify(internalPrompts), [internalPrompts]);
  const currentSignatureRef = useRef<string>(currentPromptsSignature);
  useEffect(() => {
    currentSignatureRef.current = currentPromptsSignature;
  }, [currentPromptsSignature]);
  const lastSavedSignatureRef = useRef<string>('');

  useLayoutEffect(() => {
    if (isOpen) {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
      setInternalPrompts(initialPrompts.map((prompt) => ({ ...prompt })));
      lastSavedSignatureRef.current = JSON.stringify(initialPrompts);
    }
  }, [isOpen, selectedProjectId, initialPrompts, scrollRef]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const intervalId = setInterval(() => {
      const hasChanges = lastSavedSignatureRef.current !== currentSignatureRef.current;
      if (hasChanges) {
        try {
          onSave(internalPromptsRef.current);
          lastSavedSignatureRef.current = currentSignatureRef.current;
        } catch (error) {
          normalizeAndPresentError(error, { context: 'PromptEditorModal', showToast: false });
        }
      }
    }, 3000);

    return () => clearInterval(intervalId);
  }, [isOpen, onSave]);

  const handleFinalSaveAndClose = useCallback(() => {
    onSave(internalPrompts);
    lastSavedSignatureRef.current = currentSignatureRef.current;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    onClose();
  }, [internalPrompts, onSave, onClose, scrollRef]);

  const handleInternalUpdatePrompt = useCallback((id: string, updates: Partial<Omit<PromptEntry, 'id'>>) => {
    setInternalPrompts((currentPrompts) =>
      currentPrompts.map((prompt) => (prompt.id === id ? { ...prompt, ...updates } : prompt)),
    );
  }, []);

  const handlePromptFieldUpdate = useCallback((
    id: string,
    field: 'fullPrompt' | 'shortPrompt',
    value: string,
  ) => {
    const updatePayload: Partial<Omit<PromptEntry, 'id'>> = {};
    if (field === 'fullPrompt') {
      updatePayload.fullPrompt = value;
    }
    if (field === 'shortPrompt') {
      updatePayload.shortPrompt = value;
    }
    handleInternalUpdatePrompt(id, updatePayload);
  }, [handleInternalUpdatePrompt]);

  const handleInternalRemovePrompt = useCallback((id: string) => {
    setInternalPrompts((currentPrompts) => currentPrompts.filter((prompt) => prompt.id !== id));
  }, []);

  const handleInternalAddBlankPrompt = useCallback(() => {
    const newPromptEntry: PromptEntry = { id: generatePromptId(), fullPrompt: '', shortPrompt: '' };
    setInternalPrompts((currentPrompts) => [...currentPrompts, newPromptEntry]);

    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }
    }, 100);
  }, [generatePromptId, scrollRef]);

  const handleRemoveAllPrompts = useCallback(() => {
    const emptyPrompt: PromptEntry = { id: generatePromptId(), fullPrompt: '', shortPrompt: '' };
    setInternalPrompts([emptyPrompt]);
  }, [generatePromptId]);

  return {
    internalPrompts,
    handleFinalSaveAndClose,
    handlePromptFieldUpdate,
    handleInternalRemovePrompt,
    handleInternalAddBlankPrompt,
    handleRemoveAllPrompts,
  };
}
