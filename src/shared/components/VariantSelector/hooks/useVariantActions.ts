/**
 * useVariantActions - Manages variant action state and handlers
 *
 * Extracted from VariantSelector to isolate:
 * - Delete/copy/load-settings transient UI state
 * - Action handlers (delete, copy ID, load settings)
 * - Task prefetch on hover
 */

import { useState, useCallback } from 'react';
import { useAsyncOperationMap } from '@/shared/hooks/async/useAsyncOperation';
import { usePrefetchTaskData, usePrefetchTaskById } from '@/shared/hooks/tasks/useTaskPrefetch';
import { getSourceTaskIdLegacyCompatible } from '@/shared/lib/taskIdHelpers';
import type { GenerationVariant } from '@/shared/hooks/variants/useVariants';

interface UseVariantActionsProps {
  isMobile: boolean;
  onDeleteVariant?: (variantId: string) => Promise<void>;
  onLoadVariantSettings?: (variantParams: Record<string, unknown>) => void;
}

export function useVariantActions(props: UseVariantActionsProps) {
  const {
    isMobile,
    onDeleteVariant,
    onLoadVariantSettings,
  } = props;

  // Transient UI state
  const [copiedVariantId, setCopiedVariantId] = useState<string | null>(null);
  const [loadedSettingsVariantId, setLoadedSettingsVariantId] = useState<string | null>(null);
  const [mobileInfoVariantId, setMobileInfoVariantId] = useState<string | null>(null);

  const deleteOperation = useAsyncOperationMap();

  const prefetchTaskData = usePrefetchTaskData();
  const prefetchTaskById = usePrefetchTaskById();

  const handleVariantMouseEnter = useCallback((variant: GenerationVariant) => {
    if (isMobile) return;

    const variantParams = variant.params;
    const validSourceTaskId = getSourceTaskIdLegacyCompatible(variantParams);

    if (validSourceTaskId) {
      prefetchTaskById(validSourceTaskId);
    } else {
      prefetchTaskData(variant.generation_id);
    }
  }, [isMobile, prefetchTaskData, prefetchTaskById]);

  // Action handlers

  const handleCopyId = useCallback((variantId: string) => {
    navigator.clipboard.writeText(variantId).catch(() => {});
    setCopiedVariantId(variantId);
    setTimeout(() => setCopiedVariantId(null), 2000);
  }, []);

  const handleLoadSettings = useCallback((variant: GenerationVariant) => {
    if (!onLoadVariantSettings) return;
    onLoadVariantSettings(variant.params as Record<string, unknown>);
    setLoadedSettingsVariantId(variant.id);
    setTimeout(() => setLoadedSettingsVariantId(null), 2000);
  }, [onLoadVariantSettings]);

  const handleDeleteVariant = useCallback((variantId: string) => {
    if (!onDeleteVariant) return;
    deleteOperation.execute(
      variantId,
      () => onDeleteVariant(variantId),
      { context: 'VariantSelector' }
    );
  }, [onDeleteVariant, deleteOperation]);

  return {
    // Transient state
    copiedVariantId,
    loadedSettingsVariantId,
    mobileInfoVariantId,
    setMobileInfoVariantId,

    // Handlers
    handleVariantMouseEnter,
    handleCopyId,
    handleLoadSettings,
    handleDeleteVariant,
    isDeleteLoading: (id: string) => deleteOperation.isLoading(id),
  };
}
