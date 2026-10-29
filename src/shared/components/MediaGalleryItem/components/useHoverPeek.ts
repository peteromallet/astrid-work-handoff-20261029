import { useCallback, useEffect, useRef, useState } from 'react';
import { mediaCrossOrigin } from '@/shared/lib/media/mediaCrossOrigin';

export const PEEK_OPEN_DELAY_MS = 120;
export const PEEK_CLOSE_GRACE_MS = 120;

/** Full-size URLs already fetched by a peek, so a repeat peek opens with the image ready. */
const loadedPeekUrls = new Set<string>();

/** Closes whichever peek is open now; a peek that opens closes this one first. */
let closeCurrentPeek: (() => void) | null = null;

export function isPeekImageLoaded(url: string): boolean {
  return loadedPeekUrls.has(url);
}

export function markPeekImageLoaded(url: string): void {
  loadedPeekUrls.add(url);
}

/** Starts fetching the full-size image. Called on the eye's pointerenter, before the peek opens. */
export function preloadPeekImage(url: string | null | undefined): void {
  if (!url || loadedPeekUrls.has(url) || typeof Image === 'undefined') return;
  const image = new Image();
  const cors = mediaCrossOrigin(url);
  if (cors) image.crossOrigin = cors;
  image.onload = () => markPeekImageLoaded(url);
  image.src = url;
}

/**
 * Hover state for the eye button and the peek it opens. The eye opens the peek after a short
 * delay; leaving the eye or the peek closes it after a grace period, so the pointer can cross
 * from one to the other. Only one peek is open at a time.
 */
export function useHoverPeek(preloadUrl: string | null) {
  const [open, setOpen] = useState(false);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const close = useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    if (closeCurrentPeek === close) closeCurrentPeek = null;
    setOpen(false);
  }, [clearOpenTimer, clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(close, PEEK_CLOSE_GRACE_MS);
  }, [clearCloseTimer, close]);

  const onEyeEnter = useCallback(() => {
    preloadPeekImage(preloadUrl);
    clearCloseTimer();
    if (open) return;
    clearOpenTimer();
    openTimerRef.current = setTimeout(() => {
      openTimerRef.current = null;
      if (closeCurrentPeek && closeCurrentPeek !== close) closeCurrentPeek();
      closeCurrentPeek = close;
      setOpen(true);
    }, PEEK_OPEN_DELAY_MS);
  }, [preloadUrl, open, clearCloseTimer, clearOpenTimer, close]);

  const onEyeLeave = useCallback(() => {
    clearOpenTimer();
    scheduleClose();
  }, [clearOpenTimer, scheduleClose]);

  const onPeekEnter = useCallback(() => clearCloseTimer(), [clearCloseTimer]);
  const onPeekLeave = scheduleClose;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  useEffect(() => () => {
    clearOpenTimer();
    clearCloseTimer();
    if (closeCurrentPeek === close) closeCurrentPeek = null;
  }, [clearOpenTimer, clearCloseTimer, close]);

  return {
    open,
    close,
    eyeHandlers: { onPointerEnter: onEyeEnter, onPointerLeave: onEyeLeave },
    peekHandlers: { onPointerEnter: onPeekEnter, onPointerLeave: onPeekLeave },
  };
}
