import { useMemo, useRef } from 'react';
import type { HydratedReferenceImage } from '../types';

interface UseReferenceSelectionProps {
  effectiveShotId: string;
  referenceCount: number;
  selectedReferenceId: string | null;
  hydratedReferences: HydratedReferenceImage[];
  isLoadingProjectSettings: boolean;
}

interface UseReferenceSelectionReturn {
  displayedReferenceId: string | null;
  selectedReference: HydratedReferenceImage | null;
  currentSelectedReference: HydratedReferenceImage | null;
  isReferenceDataLoading: boolean;
  hasEnoughReferences: boolean;
  hasStaleSelection: boolean;
}

type FallbackCache = { shotId: string; referenceId: string } | null;

const getNewestReferenceId = (references: HydratedReferenceImage[]): string | null => {
  if (references.length === 0) return null;
  return [...references]
    .sort((left, right) => {
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return rightTime - leftTime;
    })[0]?.id ?? null;
};

export function useReferenceSelection(props: UseReferenceSelectionProps): UseReferenceSelectionReturn {
  const {
    effectiveShotId,
    referenceCount,
    selectedReferenceId,
    hydratedReferences,
    isLoadingProjectSettings,
  } = props;

  const fallbackCache = useRef<FallbackCache>(null);
  const lastValidSelectedReference = useRef<HydratedReferenceImage | null>(null);

  const displayedReferenceId = useMemo(() => {
    if (hydratedReferences.length === 0) {
      return null;
    }

    if (selectedReferenceId && hydratedReferences.some((reference) => reference.id === selectedReferenceId)) {
      if (fallbackCache.current?.shotId === effectiveShotId) {
        fallbackCache.current = null;
      }
      return selectedReferenceId;
    }

    if (selectedReferenceId && hydratedReferences.length < referenceCount) {
      return null;
    }

    if (fallbackCache.current?.shotId === effectiveShotId) {
      const cachedReferenceId = fallbackCache.current.referenceId;
      if (hydratedReferences.some((reference) => reference.id === cachedReferenceId)) {
        return cachedReferenceId;
      }
      fallbackCache.current = null;
    }

    const fallbackId = getNewestReferenceId(hydratedReferences);
    if (fallbackId) {
      fallbackCache.current = { shotId: effectiveShotId, referenceId: fallbackId };
    }
    return fallbackId;
  }, [effectiveShotId, hydratedReferences, referenceCount, selectedReferenceId]);

  const currentSelectedReference =
    hydratedReferences.find((reference) => reference.id === displayedReferenceId) || null;

  if (currentSelectedReference) {
    lastValidSelectedReference.current = currentSelectedReference;
  }

  const selectedReference = currentSelectedReference || lastValidSelectedReference.current;
  const hasEnoughReferences =
    referenceCount > 0 && hydratedReferences.length >= Math.floor(referenceCount * 0.9);
  const hasStaleSelection =
    !!selectedReferenceId && !currentSelectedReference && hydratedReferences.length > 0;
  const selectionPendingValidation =
    !!selectedReferenceId && hydratedReferences.length === 0 && referenceCount > 0;

  const isReferenceDataLoading =
    hydratedReferences.length === 0 &&
    ((isLoadingProjectSettings && !hasEnoughReferences) ||
      selectionPendingValidation);

  return {
    displayedReferenceId,
    selectedReference,
    currentSelectedReference,
    isReferenceDataLoading,
    hasEnoughReferences,
    hasStaleSelection,
  };
}
