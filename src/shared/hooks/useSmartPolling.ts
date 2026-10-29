import { useEffect, useMemo, useReducer, useRef } from 'react';
import { dataFreshnessManager } from '@/shared/realtime/DataFreshnessManager';

interface SmartPollingConfig {
  queryKey: readonly string[];
  /** Default: 5 minutes. Set to false to disable polling when realtime is healthy. */
  minInterval?: number | false;
  /** Polling interval when realtime is broken. Default: 5 seconds. */
  maxInterval?: number;
  /** How fresh data needs to be to avoid aggressive polling. Default: 30 seconds. */
  freshnessThreshold?: number;
  debug?: boolean;
}

interface SmartPollingResult {
  /** Use as React Query refetchInterval */
  refetchInterval: number | false;
  /** Use as React Query staleTime */
  staleTime: number;
  isDataFresh: boolean;
  realtimeStatus: 'connected' | 'disconnected' | 'error';
  /** Only populated when debug: true */
  debug?: {
    pollingReason: string;
    lastEventAge?: number;
    diagnostics: ReturnType<typeof dataFreshnessManager.getDiagnostics> | null;
  };
}

/**
 * @internal Used by useSmartPollingConfig - not directly exported.
 */
function useSmartPolling(config: SmartPollingConfig): SmartPollingResult {
  const {
    queryKey,
    minInterval = 5 * 60 * 1000,
    maxInterval = 15000,
    freshnessThreshold = 30000,
    debug = false
  } = config;

  // Mobile devices get longer polling intervals to reduce CPU/battery usage
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const [, forceUpdate] = useReducer(x => x + 1, 0);
  const lastIntervalRef = useRef<number | false | null>(null);

  // Ref keeps queryKey current without adding it to effect deps (arrays are new refs each render)
  const queryKeyRef = useRef(queryKey);
  queryKeyRef.current = queryKey;
  const queryKeyString = JSON.stringify(queryKey);

  // Batch rapid DataFreshnessManager notifications into a single re-render
  const pendingUpdateRef = useRef(false);

  useEffect(() => {
    let active = true;

    const unsubscribe = dataFreshnessManager.subscribe(() => {
      const currentInterval = dataFreshnessManager.getPollingInterval(queryKeyRef.current);
      if (lastIntervalRef.current !== currentInterval) {
        if (!pendingUpdateRef.current) {
          pendingUpdateRef.current = true;
          queueMicrotask(() => {
            pendingUpdateRef.current = false;
            if (active) {
              forceUpdate();
            }
          });
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [queryKeyString, debug]);

  const pollingInterval = dataFreshnessManager.getPollingInterval(queryKey);
  lastIntervalRef.current = pollingInterval;
  const isDataFresh = dataFreshnessManager.isDataFresh(queryKey, freshnessThreshold);
  const diagnostics = debug ? dataFreshnessManager.getDiagnostics() : null;

  let finalInterval: number | false;
  let pollingReason: string;

  const mobileMultiplier = isMobile ? 2 : 1;
  const effectiveMaxInterval = maxInterval * mobileMultiplier;
  const effectiveMinInterval = minInterval === false ? false : minInterval * mobileMultiplier;

  if (pollingInterval === false) {
    if (effectiveMinInterval === false) {
      finalInterval = false;
      pollingReason = 'disabled (realtime healthy)';
    } else {
      finalInterval = effectiveMinInterval;
      pollingReason = 'minInterval fallback';
    }
  } else if (effectiveMinInterval !== false && pollingInterval > effectiveMinInterval && isDataFresh) {
    finalInterval = effectiveMinInterval;
    pollingReason = 'data fresh, using minInterval';
  } else if (pollingInterval < effectiveMaxInterval) {
    finalInterval = effectiveMaxInterval;
    pollingReason = 'clamped to maxInterval';
  } else {
    finalInterval = pollingInterval * mobileMultiplier;
    pollingReason = 'freshness manager interval';
  }

  const staleTime = isDataFresh ? freshnessThreshold : 0;

  const result: SmartPollingResult = {
    refetchInterval: finalInterval,
    staleTime,
    isDataFresh,
    realtimeStatus: diagnostics?.realtimeStatus || 'disconnected'
  };

  if (debug) {
    const queryAge = diagnostics?.queryAges?.find(q => 
      JSON.stringify(q.query) === JSON.stringify(queryKey)
    );

    result.debug = {
      pollingReason,
      lastEventAge: queryAge?.ageMs,
      diagnostics
    };

  }

  return result;
}

/**
 * Returns { refetchInterval, staleTime } to spread into useQuery options.
 * Defaults to minInterval: false so polling is fully disabled when realtime is healthy.
 */
export function useSmartPollingConfig(queryKey: readonly string[], debug = false) {
  const { refetchInterval, staleTime } = useSmartPolling({
    queryKey,
    debug,
    minInterval: false,
  });

  // Stable reference so useQuery doesn't see "changed" options on every render
  return useMemo(() => ({
    refetchInterval,
    staleTime
  }), [refetchInterval, staleTime]);
}
