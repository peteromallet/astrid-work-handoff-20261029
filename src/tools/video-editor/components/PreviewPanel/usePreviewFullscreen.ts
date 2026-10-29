import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * `native`: the browser's Fullscreen API holds the preview. `window`: the preview covers the
 * whole browser window instead, where an element cannot go fullscreen (iPhone Safari only
 * fullscreens <video>) or the browser refused.
 */
export type PreviewFullscreenMode = 'off' | 'native' | 'window';

/** Marks the fullscreen preview; editor shortcuts stand aside while it is there. */
export const PREVIEW_FULLSCREEN_ATTRIBUTE = 'data-preview-fullscreen';

type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

function fullscreenElement(): Element | null {
  const doc = document as WebkitDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function canFullscreen(element: HTMLElement): boolean {
  const doc = document as WebkitDocument;
  const enabled = doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled ?? false;
  return enabled && Boolean(element.requestFullscreen || (element as WebkitElement).webkitRequestFullscreen);
}

function exitDocumentFullscreen(onFailure: () => void): void {
  const doc = document as WebkitDocument;
  try {
    void Promise.resolve(doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.()).catch(onFailure);
  } catch {
    onFailure();
  }
}

export function isPreviewFullscreenActive(): boolean {
  return typeof document !== 'undefined' && document.querySelector(`[${PREVIEW_FULLSCREEN_ATTRIBUTE}]`) !== null;
}

export function usePreviewFullscreen(containerRef: RefObject<HTMLElement>) {
  const [mode, setMode] = useState<PreviewFullscreenMode>('off');
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const enter = useCallback(() => {
    const element = containerRef.current;
    if (!element || modeRef.current !== 'off') return;
    if (!canFullscreen(element)) {
      setMode('window');
      return;
    }
    const request = element.requestFullscreen
      ? () => element.requestFullscreen({ navigationUI: 'hide' })
      : () => (element as WebkitElement).webkitRequestFullscreen?.();
    try {
      // `fullscreenchange` confirms the native mode; a refusal falls back to the window.
      Promise.resolve(request()).catch(() => setMode('window'));
    } catch {
      setMode('window');
    }
  }, [containerRef]);

  const exit = useCallback(() => {
    if (modeRef.current === 'window') {
      setMode('off');
      return;
    }
    if (modeRef.current === 'native' && fullscreenElement()) exitDocumentFullscreen(() => setMode('off'));
  }, []);

  const toggle = useCallback(() => {
    if (modeRef.current === 'off') enter();
    else exit();
  }, [enter, exit]);

  // The browser's own exits (Esc, the system gesture, a tab switch) arrive here.
  useEffect(() => {
    const onChange = () => {
      const element = containerRef.current;
      const held = element !== null && fullscreenElement() === element;
      setMode((previous) => (held ? 'native' : previous === 'native' ? 'off' : previous));
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, [containerRef]);

  // The window cover has no browser Esc, and the page behind it must not scroll.
  useEffect(() => {
    if (mode !== 'window') return undefined;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previousOverflow;
    };
  }, [mode]);

  // Leaving the page (or a remount) while fullscreen hands the screen back.
  useEffect(() => () => {
    if (modeRef.current === 'native' && fullscreenElement()) exitDocumentFullscreen(() => undefined);
  }, []);

  return { mode, enter, exit, toggle };
}
