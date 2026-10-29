import type { GenerationRow } from '@/domains/generation/types';
import type { DerivedNavContext } from '@/shared/components/ShotImageManager/types';

interface NavigateDerivedStepInput {
  derivedNavContext: DerivedNavContext | null;
  lightboxIndex: number | null;
  currentImages: GenerationRow[];
  direction: 'next' | 'prev';
  handleOpenExternalGeneration: (generationId: string, derivedContext?: string[]) => Promise<void>;
}

export function navigateDerivedStep({
  derivedNavContext,
  lightboxIndex,
  currentImages,
  direction,
  handleOpenExternalGeneration,
}: NavigateDerivedStepInput): boolean {
  if (!derivedNavContext || lightboxIndex === null) {
    return false;
  }

  const currentId = currentImages[lightboxIndex]?.id;
  const currentDerivedIndex = derivedNavContext.derivedGenerationIds.indexOf(currentId);

  if (currentDerivedIndex === -1) {
    return true;
  }

  if (direction === 'next' && currentDerivedIndex < derivedNavContext.derivedGenerationIds.length - 1) {
    const nextId = derivedNavContext.derivedGenerationIds[currentDerivedIndex + 1];
    void handleOpenExternalGeneration(nextId, derivedNavContext.derivedGenerationIds);
  }

  if (direction === 'prev' && currentDerivedIndex > 0) {
    const prevId = derivedNavContext.derivedGenerationIds[currentDerivedIndex - 1];
    void handleOpenExternalGeneration(prevId, derivedNavContext.derivedGenerationIds);
  }

  return true;
}
