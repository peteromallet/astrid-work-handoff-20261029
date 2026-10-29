import { useMemo } from 'react';
import { usePanesStore } from '@/shared/state/panesStore';
import {
  shouldAccountForTasksPane,
  type OverlayViewportConstraints,
} from '@/shared/lib/layout/overlayViewportConstraints';

interface UseLightboxPaneLayoutArgs {
  overlayViewport: OverlayViewportConstraints;
}

interface LightboxPaneLayoutStyles {
  overlayStyle: React.CSSProperties;
  contentStyle: React.CSSProperties;
}

export function useLightboxPaneLayout({
  overlayViewport,
}: UseLightboxPaneLayoutArgs): LightboxPaneLayoutStyles {
  const galleryHeight = usePanesStore((state) => (
    state.isGenerationsPaneOpen || state.isGenerationsPaneLocked
      ? state.effectiveGenerationsPaneHeight
      : 0
  ));
  return useMemo(() => {
    const accountForTasksPane = shouldAccountForTasksPane(overlayViewport);

    const overlayStyle: React.CSSProperties = {
      pointerEvents: 'all',
      touchAction: 'none',
      cursor: 'pointer',
      zIndex: 10000,
      position: 'fixed',
      top: 0,
      left: 0,
      right: accountForTasksPane ? `${overlayViewport.tasksPaneWidth}px` : 0,
      bottom: galleryHeight,
      transition: 'right 300ms cubic-bezier(0.22, 1, 0.36, 1), width 300ms cubic-bezier(0.22, 1, 0.36, 1)',
      ...(accountForTasksPane
        ? { width: `calc(100vw - ${overlayViewport.tasksPaneWidth}px)` }
        : {}),
    };

    const contentStyle: React.CSSProperties = {
      '--lightbox-available-height': `calc(100dvh - ${galleryHeight}px)`,
      transition: 'width 300ms cubic-bezier(0.22, 1, 0.36, 1)',
      ...(overlayViewport.needsTasksPaneOffset
        ? { width: `calc(100vw - ${overlayViewport.tasksPaneWidth}px)` }
        : overlayViewport.needsFullscreenLayout
        ? { width: '100vw' }
        : {}),
      ...(galleryHeight > 0 ? {
        top: 0,
        left: 0,
        bottom: galleryHeight,
        width: accountForTasksPane ? `calc(100vw - ${overlayViewport.tasksPaneWidth}px)` : '100vw',
        height: `calc(100dvh - ${galleryHeight}px)`,
        maxHeight: `calc(100dvh - ${galleryHeight}px)`,
        transform: 'none',
      } : {}),
    } as React.CSSProperties;

    return { overlayStyle, contentStyle };
  }, [overlayViewport, galleryHeight]);
}
