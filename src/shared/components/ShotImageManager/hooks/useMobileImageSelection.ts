import { useCallback, useEffect, useState } from 'react';
import { dispatchAppEvent } from '@/shared/lib/typedEvents';

interface UseMobileImageSelectionParams {
  readOnly: boolean;
  onSelectionChange?: (hasSelection: boolean) => void;
}

export function useMobileImageSelection({
  readOnly,
  onSelectionChange,
}: UseMobileImageSelectionParams) {
  const [mobileSelectedIds, setMobileSelectedIds] = useState<string[]>([]);
  const [showSelectionBar, setShowSelectionBar] = useState(false);

  const isInMoveMode = mobileSelectedIds.length > 0;

  useEffect(() => {
    if (mobileSelectedIds.length > 0) {
      const timer = setTimeout(() => {
        setShowSelectionBar(true);
      }, 200);
      return () => clearTimeout(timer);
    }
    setShowSelectionBar(false);
  }, [mobileSelectedIds.length]);

  useEffect(() => {
    const hasSelection = mobileSelectedIds.length > 0;
    dispatchAppEvent('mobileSelectionActive', hasSelection);
    onSelectionChange?.(hasSelection);

    return () => {
      dispatchAppEvent('mobileSelectionActive', false);
    };
  }, [mobileSelectedIds.length, onSelectionChange]);

  const handleMobileTap = useCallback(
    (imageId: string, _index?: number) => {
      if (readOnly) {
        return;
      }

      const wasSelected = mobileSelectedIds.includes(imageId);
      if (wasSelected) {
        setMobileSelectedIds((previous) =>
          previous.filter((id) => id !== imageId)
        );
      } else {
        setMobileSelectedIds((previous) => [...previous, imageId]);
      }
    },
    [mobileSelectedIds, readOnly]
  );

  const clearSelection = useCallback(() => {
    setMobileSelectedIds([]);
    onSelectionChange?.(false);
  }, [onSelectionChange]);

  return {
    mobileSelectedIds,
    setMobileSelectedIds,
    showSelectionBar,
    isInMoveMode,
    handleMobileTap,
    clearSelection,
  };
}
