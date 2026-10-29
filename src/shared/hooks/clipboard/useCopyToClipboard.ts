import { useState, useCallback, useEffect, useRef } from 'react';
import { writeClipboardTextSafe } from '@/shared/lib/browser/clipboard';

/**
 * Hook for copying text to clipboard with temporary visual feedback.
 */
export function useCopyToClipboard(text: string | undefined) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!text) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    void writeClipboardTextSafe(text);
  }, [text]);

  return { copied, handleCopy };
}

/**
 * Keyed form for lists of copy buttons: `copiedValue` is the indicator passed to
 * the last successful `copyText` and resets to null after `resetMs`.
 */
export function useKeyedCopyToClipboard<T>(resetMs = 2000) {
  const [copiedValue, setCopiedValue] = useState<T | null>(null);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  const copyText = useCallback(
    async (text: string, copiedIndicator: T) => {
      const copied = await writeClipboardTextSafe(text);
      if (!copied) {
        return false;
      }

      setCopiedValue(copiedIndicator);
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
      resetTimeoutRef.current = setTimeout(() => {
        setCopiedValue(null);
        resetTimeoutRef.current = null;
      }, resetMs);
      return true;
    },
    [resetMs],
  );

  return { copiedValue, copyText };
}
