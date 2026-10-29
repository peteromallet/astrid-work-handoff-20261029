export interface ImageGenerationFormUIState {
  isPromptModalOpen: boolean;
  directFormActivePromptId: string | null;
  hasVisitedImageGeneration: boolean;
}

export type ImageGenerationFormUIAction =
  | { type: 'SET_PROMPT_MODAL_OPEN'; payload: boolean }
  | { type: 'SET_ACTIVE_PROMPT_ID'; payload: string | null }
  | { type: 'SET_HAS_VISITED'; payload: boolean }
  | { type: 'CLOSE_PROMPT_MODAL' };

export const createInitialUIState = (): ImageGenerationFormUIState => {
  let hasVisited = false;
  try {
    hasVisited = typeof window !== 'undefined' &&
      window.sessionStorage.getItem('hasVisitedImageGeneration') === 'true';
  } catch {
    // sessionStorage can fail in restricted environments
  }

  return {
    isPromptModalOpen: false,
    directFormActivePromptId: null,
    hasVisitedImageGeneration: hasVisited,
  };
};
