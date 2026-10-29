import { useEffect } from 'react';
import { getViewportLockRuntime } from '@/shared/runtime/viewportLockRuntime';
import { acquireLightboxOpenState } from '@/shared/state/lightboxOpenState';

interface UseLightboxViewportLockArgs {
  isActuallyModal: boolean;
}

export function useLightboxViewportLock({ isActuallyModal }: UseLightboxViewportLockArgs): void {
  useEffect(() => {
    const releaseLightboxOpen = acquireLightboxOpenState();
    const unlockViewport = isActuallyModal
      ? undefined
      : getViewportLockRuntime().lockLightboxViewport();

    return () => {
      unlockViewport?.();
      releaseLightboxOpen();
    };
  }, [isActuallyModal]);
}
