import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const GATEWAY = 'http://127.0.0.1:17340';

// What `runtimeApiBase()` answered at each boot step, read from the same module instance main.tsx used.
const seen = vi.hoisted(() => ({ steps: [] as Array<[string, string]> }));

async function record(step: string): Promise<void> {
  const { runtimeApiBase } = await import('@/integrations/runtime/connection.ts');
  seen.steps.push([step, runtimeApiBase()]);
}

vi.mock('@/tools/video-editor/browser/initializeVideoEditorExtensionRuntime', () => ({
  initializeVideoEditorExtensionRuntime: async () => { await record('extension runtime'); },
}));

// Migration failure/retry is covered separately; this test observes boot order after successful migration.
vi.mock('@/migrations/astridRenameBrowserMigration.ts', () => ({
  migrateAstridBrowserStorage: async () => ({ success: true }),
}));

describe('main entry boot order', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    // This suite observes the normal connected app branch; first visits now open welcome.
    localStorage.setItem('astrid.runtime.connectedBefore', '1');
    // doMock per case: a vi.mock factory's result survives resetModules, so its import-time read would run once.
    vi.doMock('@/app/bootstrap', async () => {
      await record('import bootstrap');
      return { renderApp: () => { void record('render'); } };
    });
    seen.steps = [];
    document.body.replaceChildren();
    const root = document.createElement('div');
    root.id = 'root';
    document.body.append(root);
    window.history.replaceState({}, '', '/tools/video-editor');
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  it('sets the Runtime origin from VITE_RUNTIME_ORIGIN before the app modules load or render', async () => {
    vi.stubEnv('VITE_RUNTIME_ORIGIN', GATEWAY);

    await import('@/app/main');
    await vi.waitFor(() => expect(seen.steps.map(([step]) => step)).toContain('render'));
    await vi.waitFor(() => expect(seen.steps).toHaveLength(3));

    expect(seen.steps.map(([step]) => step).sort()).toEqual(['extension runtime', 'import bootstrap', 'render']);
    for (const [, base] of seen.steps) expect(base).toBe(`${GATEWAY}/api/runtime`);
  });

  it('stays same-origin when VITE_RUNTIME_ORIGIN is unset', async () => {
    vi.stubEnv('VITE_RUNTIME_ORIGIN', '');

    await import('@/app/main');
    await vi.waitFor(() => expect(seen.steps).toHaveLength(3));

    for (const [, base] of seen.steps) expect(base).toBe('/api/runtime');
  });
});
