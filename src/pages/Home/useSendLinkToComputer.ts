import { useCallback, useEffect, useRef, useState } from 'react';

/** How long the button reads "Link copied" before it goes back to its label. */
const COPIED_MS = 1_800;

/**
 * "Send the link to your computer": the share sheet where the browser has one, otherwise the link on the clipboard
 * (`copied` is true for a moment after). Shared by the landing page's install dialog and the hosted build's phone screen,
 * so both have the same label, behaviour and icon. `active` false (the dialog closed) cancels a pending reset.
 */
export function useSendLinkToComputer(getUrl: () => string, active = true) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(() => !navigator.share && !navigator.clipboard?.writeText);
  const activeRef = useRef(active);
  const requestRef = useRef(0);
  const resetRef = useRef<number | null>(null);

  const clearReset = useCallback(() => {
    if (resetRef.current !== null) {
      window.clearTimeout(resetRef.current);
      resetRef.current = null;
    }
  }, []);

  useEffect(() => {
    activeRef.current = active;
    if (!active) {
      requestRef.current += 1;
      clearReset();
      setCopied(false);
    }
  }, [active, clearReset]);

  useEffect(() => () => {
    activeRef.current = false;
    requestRef.current += 1;
    clearReset();
  }, [clearReset]);

  const send = useCallback(async () => {
    if (!activeRef.current) return;
    const request = ++requestRef.current;
    const url = getUrl();
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Astrid', url });
        return;
      }
      if (!navigator.clipboard?.writeText) {
        setFallback(true);
        return;
      }
      await navigator.clipboard.writeText(url);
      if (!activeRef.current || request !== requestRef.current) return;
      setCopied(true);
      clearReset();
      resetRef.current = window.setTimeout(() => {
        if (activeRef.current && request === requestRef.current) setCopied(false);
        resetRef.current = null;
      }, COPIED_MS);
    } catch {
      // The person dismissed the share sheet, or the clipboard is unavailable: nothing to do.
    }
  }, [clearReset, getUrl]);

  return { copied, fallback, send };
}
