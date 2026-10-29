import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock debugConfig used by reactProfilerOnRender
vi.mock('../debug/debugConfig', () => ({
  debugConfig: {
    isEnabled: vi.fn().mockReturnValue(false),
  },
}));

// The logger reads VITE_DEBUG_LOGS at call time; re-import per test so the runtime's
// one-time initialisation does not leak between cases.
async function loadLogger() {
  vi.resetModules();
  return import('../logger');
}

const originalConsole = {
  log: console.log,
  info: console.info,
  debug: console.debug,
  warn: console.warn,
  error: console.error,
};

describe('logger', () => {
  afterEach(() => {
    Object.assign(console, originalConsole);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('log function', () => {
    it('is a function', async () => {
      const { log } = await loadLogger();
      expect(typeof log).toBe('function');
    });

    it('prints a tagged line when VITE_DEBUG_LOGS is true', async () => {
      vi.stubEnv('VITE_DEBUG_LOGS', 'true');
      const sink = vi.fn();
      console.log = sink;
      const { log } = await loadLogger();

      log('TestTag', 'test message', { extra: 'data' });

      expect(sink).toHaveBeenCalledWith('[TestTag]', 'test message', { extra: 'data' });
    });

    it('prints nothing when VITE_DEBUG_LOGS is not true', async () => {
      vi.stubEnv('VITE_DEBUG_LOGS', 'false');
      const sink = vi.fn();
      console.log = sink;
      const { log } = await loadLogger();

      log('TestTag', 'hidden');

      expect(sink).not.toHaveBeenCalled();
    });

    it('accepts various argument types', async () => {
      vi.stubEnv('VITE_DEBUG_LOGS', 'true');
      console.log = vi.fn();
      const { log } = await loadLogger();
      expect(() => log('Tag', 'string', 42, true, null, undefined, { obj: 1 })).not.toThrow();
    });
  });

  describe('initializeLoggerRuntime', () => {
    it('silences console.log/info/debug/warn and keeps console.error when VITE_DEBUG_LOGS is off', async () => {
      vi.stubEnv('VITE_DEBUG_LOGS', 'false');
      vi.stubGlobal('window', { location: { pathname: '/test' } });
      const sink = vi.fn();
      const errorSink = vi.fn();
      console.log = sink;
      console.info = sink;
      console.debug = sink;
      console.warn = sink;
      console.error = errorSink;
      const { initializeLoggerRuntime } = await loadLogger();

      initializeLoggerRuntime();
      console.log('a');
      console.info('b');
      console.debug('c');
      console.warn('d');
      console.error('boom');

      expect(sink).not.toHaveBeenCalled();
      expect(errorSink).toHaveBeenCalledWith('boom');
    });

    it('leaves the console untouched when VITE_DEBUG_LOGS is true', async () => {
      vi.stubEnv('VITE_DEBUG_LOGS', 'true');
      vi.stubGlobal('window', { location: { pathname: '/test' } });
      const sink = vi.fn();
      console.log = sink;
      const { initializeLoggerRuntime } = await loadLogger();

      initializeLoggerRuntime();
      console.log('visible');

      expect(sink).toHaveBeenCalledWith('visible');
    });
  });

  describe('reactProfilerOnRender', () => {
    it('is a function', async () => {
      const { reactProfilerOnRender } = await loadLogger();
      expect(typeof reactProfilerOnRender).toBe('function');
    });

    it('does not throw when called with profiler args', async () => {
      const { reactProfilerOnRender } = await loadLogger();
      expect(() =>
        reactProfilerOnRender(
          'ComponentId',
          'mount',
          12.5,
          25.0,
          100.0,
          112.5,
          new Set()
        )
      ).not.toThrow();
    });

    it('handles missing/undefined arguments gracefully', async () => {
      const { reactProfilerOnRender } = await loadLogger();
      expect(() => reactProfilerOnRender()).not.toThrow();
      expect(() => reactProfilerOnRender('id', undefined, undefined)).not.toThrow();
    });
  });
});
