import { useCallback, useEffect, useRef } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import { useVariants } from '@/shared/hooks/variants/useVariants';
import { useVariantSelection } from '../useVariantSelection';

interface UseSharedLightboxVariantStateInput {
  media: GenerationRow;
  variantFetchGenerationId: string | null;
  initialVariantId?: string;
  isFormOnlyMode: boolean;
}

export function useSharedLightboxVariantState(input: UseSharedLightboxVariantStateInput) {
  const {
    media,
    variantFetchGenerationId,
    initialVariantId,
    isFormOnlyMode,
  } = input;

  const {
    variants,
    primaryVariant,
    activeVariant,
    isLoading: isLoadingVariants,
    setActiveVariantId: rawSetActiveVariantId,
    refetch: refetchVariants,
    setPrimaryVariant,
    deleteVariant,
  } = useVariants({
    generationId: variantFetchGenerationId,
    enabled: !isFormOnlyMode,
  });

  const { setActiveVariantId: baseSetActiveVariantId } = useVariantSelection({
    media,
    viewedGenerationId: variantFetchGenerationId,
    rawSetActiveVariantId,
    activeVariant,
    variants,
    initialVariantId,
  });

  const intendedActiveVariantIdRef = useRef<string | null>(activeVariant?.id || null);

  useEffect(() => {
    if (activeVariant?.id && activeVariant.id !== intendedActiveVariantIdRef.current) {
      intendedActiveVariantIdRef.current = activeVariant.id;
    }
  }, [activeVariant?.id]);

  const setActiveVariantId = useCallback(
    (variantId: string) => {
      intendedActiveVariantIdRef.current = variantId;
      baseSetActiveVariantId(variantId);
    },
    [baseSetActiveVariantId],
  );

  return {
    variants,
    primaryVariant,
    activeVariant,
    isLoadingVariants,
    setActiveVariantId,
    refetchVariants,
    setPrimaryVariant,
    deleteVariant,
    intendedActiveVariantIdRef,
  };
}
