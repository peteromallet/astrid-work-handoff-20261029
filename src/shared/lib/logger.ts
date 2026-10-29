import { debugConfig } from './debug/debugConfig';

// Lightweight logging helper gated by a Vite env flag.
// Usage:
//   import { log } from '@/shared/lib/logger';
//   log('MyTag', 'Some message', optionalData);
//
// Logs are only printed when `VITE_DEBUG_LOGS` is set to `true` (or `1`).
// When it is not set, initializeLoggerRuntime() silences console.log/info/
// debug/warn so production-like runs stay quiet; console.error always stays on.
//
// Tag format guideline (keep short & consistent):
//   [Area][Specific] e.g. [TaskPoller], [Render:GenerationsPane]

let loggerRuntimeInitialized = false;

// ===== HELPERS =====

function getEnvFlag(viteKey: string): string | undefined {
  const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  const viteValue = env?.[viteKey];
  if (typeof viteValue === 'string') {
    return viteValue;
  }
  if (typeof process !== 'undefined') {
    return (process as { env?: Record<string, string | undefined> }).env?.[viteKey];
  }
  return undefined;
}

function shouldLog(): boolean {
  const flag = getEnvFlag('VITE_DEBUG_LOGS');
  return flag === 'true' || flag === '1';
}

// ===== PUBLIC API =====

export function log(tag: string, ...args: unknown[]): void {
  if (!shouldLog()) return;

  console.log(`[${tag}]`, ...args);
}

// Dedicated onRender callback for React Profiler so callers don't need to re-implement it.
export function reactProfilerOnRender(...rawArgs: unknown[]): void {
  if (!debugConfig.isEnabled('reactProfiler')) {
    return; // Skip logging if ReactProfiler debugging is disabled
  }

  const [id, phase, actualDuration, baseDuration, startTime, commitTime, interactions] = rawArgs;
  const formatDurationMs = (value: unknown): string => {
    if (typeof value === 'number') {
      return `${value.toFixed(2)}ms`;
    }
    return `${String(value)}ms`;
  };
  const getSize = (value: unknown): number => {
    if (!value || typeof value !== 'object') return 0;
    const candidate = value as { size?: unknown };
    return typeof candidate.size === 'number' ? candidate.size : 0;
  };

  log('ReactProfiler', {
    id,
    phase,
    actualDuration: formatDurationMs(actualDuration),
    baseDuration: formatDurationMs(baseDuration),
    startTime: formatDurationMs(startTime),
    commitTime: formatDurationMs(commitTime),
    interactionsCount: getSize(interactions),
  });
}

// ===== CONSOLE SILENCING =====
// VITE_DEBUG_LOGS unset or false: console.log/info/debug/warn are no-ops.
// VITE_DEBUG_LOGS=true: the console is left as the browser provides it.

function silenceConsoleUnlessDebug(): void {
  if (typeof window === 'undefined' || shouldLog()) return;

  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
  console.warn = () => {};
  // console.error stays live
}

export function initializeLoggerRuntime(): void {
  if (loggerRuntimeInitialized) {
    return;
  }
  silenceConsoleUnlessDebug();
  loggerRuntimeInitialized = true;
}
