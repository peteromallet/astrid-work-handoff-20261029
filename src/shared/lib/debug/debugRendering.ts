import { useRef } from 'react';
import { debugChannelEnabled, debugLog, debugWarn } from './debugConsole';

const LOOP_DETECT_THRESHOLD = 15;
const LOOP_DETECT_WINDOW_MS = 1000;

// Dev-only render-rate tracker and loop detector.
export function useRenderLogger(label: string, data?: Record<string, unknown>): void {
  const countRef = useRef(0);
  const windowTimestampsRef = useRef<number[]>([]);

  if (import.meta.env.DEV) {
    countRef.current++;
    const now = Date.now();
    windowTimestampsRef.current.push(now);

    const cutoff = now - LOOP_DETECT_WINDOW_MS;
    let i = 0;
    while (i < windowTimestampsRef.current.length && windowTimestampsRef.current[i] < cutoff) {
      i++;
    }
    if (i > 0) windowTimestampsRef.current.splice(0, i);

    const recentCount = windowTimestampsRef.current.length;
    const total = countRef.current;

    if (recentCount >= LOOP_DETECT_THRESHOLD) {
      debugWarn(
        'render',
        `[RenderLoop] ${label} — ${recentCount} renders in ${LOOP_DETECT_WINDOW_MS}ms (total: ${total})`,
        data,
      );
    }
  }
}

// Dev-only dep-change tracker.
export function useChangedDepsLogger(
  label: string,
  deps: Record<string, unknown>,
  force = false,
): void {
  const prevRef = useRef<Record<string, unknown>>({});

  if (import.meta.env.DEV) {
    if (force || debugChannelEnabled('render')) {
      const changed: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of Object.keys(deps)) {
        if (!Object.is(deps[key], prevRef.current[key])) {
          changed[key] = { from: prevRef.current[key], to: deps[key] };
        }
      }
      if (Object.keys(changed).length > 0) {
        debugLog('render', `[DepsChanged] ${label}`, changed, force);
      }
    }
    prevRef.current = deps;
  }
}
