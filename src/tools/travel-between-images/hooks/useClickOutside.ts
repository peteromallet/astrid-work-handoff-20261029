import { useEffect, useRef, useCallback, RefObject } from 'react';

type EventType = 'click' | 'mousedown' | 'touchstart';

interface UseClickOutsideOptions {
  events?: EventType[];
  enabled?: boolean;
  delay?: number;
  capture?: boolean;
}

/** Listen for outside clicks and invoke `callback` when they occur. Example: `const ref = useClickOutside(() => setOpen(false));` */
export function useClickOutside<T extends HTMLElement = HTMLDivElement>(
  callback: () => void,
  options: UseClickOutsideOptions = {},
  existingRef?: RefObject<T>
): RefObject<T> {
  const {
    events = ['mousedown'],
    enabled = true,
    delay = 0,
    capture = false,
  } = options;

  const internalRef = useRef<T>(null);
  const ref = existingRef || internalRef;
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const handleEvent = useCallback((event: Event) => {
    if (ref.current && !ref.current.contains(event.target as Node)) {
      callbackRef.current();
    }
  }, [ref]);

  useEffect(() => {
    if (!enabled) return;

    const subscribe = () => {
      events.forEach((eventType) => {
        document.addEventListener(eventType, handleEvent, { capture });
      });
    };

    const unsubscribe = () => {
      events.forEach((eventType) => {
        document.removeEventListener(eventType, handleEvent, { capture });
      });
    };

    const timeoutId = delay > 0 ? setTimeout(subscribe, delay) : null;
    if (!timeoutId) subscribe();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [enabled, events, handleEvent, delay, capture]);

  return ref;
}
