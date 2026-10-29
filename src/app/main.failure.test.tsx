import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const boot = vi.hoisted(() => ({
  migrate: vi.fn(), release: vi.fn(), setRuntimeOrigin: vi.fn(), runtimeOrigin: vi.fn(() => 'http://127.0.0.1:17340'), renderApp: vi.fn(),
  initializeExtension: vi.fn(), initializeRuntime: vi.fn(),
}));
vi.mock('@/migrations/astridRenameBrowserMigration.ts', () => ({ migrateAstridBrowserStorage: boot.migrate }));
vi.mock('@/app/bootLayer.ts', () => ({ releaseBootLayerWhenReady: boot.release }));
vi.mock('@/integrations/runtime/connection.ts', () => ({ setRuntimeOrigin: boot.setRuntimeOrigin, runtimeOrigin: boot.runtimeOrigin }));
vi.mock('@/app/bootstrap', () => ({ renderApp: boot.renderApp }));
vi.mock('@/tools/video-editor/browser/initializeVideoEditorExtensionRuntime.ts', () => ({
  initializeVideoEditorExtensionRuntime: boot.initializeExtension,
}));
vi.mock('@/integrations/runtime/client.ts', () => ({ initializeWorkspaceRuntimeIdentity: boot.initializeRuntime }));

describe('main startup failures', () => {
  const reload = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    boot.migrate.mockReset();
    boot.release.mockReset();
    boot.setRuntimeOrigin.mockReset();
    boot.runtimeOrigin.mockReturnValue('http://127.0.0.1:17340');
    boot.renderApp.mockReset();
    boot.initializeExtension.mockReset();
    boot.initializeRuntime.mockReset();
    reload.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    document.body.innerHTML = '<div id="root"></div>';
    window.history.replaceState({}, '', '/tools/video-editor');
    const { href, origin, pathname, search, hash } = window.location;
    vi.stubGlobal('location', { href, origin, pathname, search, hash, reload });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('shows a Reload screen and releases the boot layer when startup throws', async () => {
    sessionStorage.setItem('astrid:preload-reloaded', '1');
    boot.migrate.mockRejectedValue(new Error('Failed to fetch dynamically imported module'));
    await import('@/app/main');
    await vi.waitFor(() => expect(boot.release).toHaveBeenCalledOnce());
    const root = document.getElementById('root')!;
    expect(root.textContent).toContain('Astrid could not start');
    expect(sessionStorage.getItem('astrid:preload-reloaded')).toBe('1');
    const repeatedChunk = Object.assign(new Event('vite:preloadError', { cancelable: true }), { payload: new Error('Failed to fetch dynamically imported module: https://cdn.test/old.js') });
    window.dispatchEvent(repeatedChunk);
    expect(repeatedChunk.defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    const button = root.querySelector('button')!;
    expect(button.textContent).toBe('Reload');
    button.click();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('shows the same Reload screen when main fails before startApp', async () => {
    boot.setRuntimeOrigin.mockImplementation(() => { throw new Error('entry setup failed'); });
    await import('@/app/main');
    await vi.waitFor(() => expect(boot.release).toHaveBeenCalledOnce());
    const root = document.getElementById('root')!;
    expect(root.textContent).toContain('Astrid could not start');
    expect(root.querySelector('button')?.textContent).toBe('Reload');
  });

  it('clears the reload guard only after a render that stays free of chunk failures', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    sessionStorage.setItem('astrid:preload-reloaded', JSON.stringify({ urls: ['https://cdn.test/old.js'], lastReloadAt: 1 }));
    localStorage.setItem('astrid:welcome-v1', 'complete');
    boot.migrate.mockResolvedValue({ success: true });
    boot.renderApp.mockImplementation((root: HTMLElement) => root.append(document.createElement('section')));
    window.history.replaceState({}, '', '/tools/video-editor?localTest=1');

    await import('@/app/main');
    await vi.waitFor(() => expect(document.querySelector('#root section')).not.toBeNull());
    // First paint is not enough: a still-missing lazy chunk fails right after the shell renders.
    expect(JSON.parse(sessionStorage.getItem('astrid:preload-reloaded')!)).toEqual({ urls: ['https://cdn.test/old.js'], lastReloadAt: 1 });
    vi.advanceTimersByTime(10_000);
    expect(JSON.parse(sessionStorage.getItem('astrid:preload-reloaded')!)).toEqual({ urls: ['https://cdn.test/old.js'], lastReloadAt: null });
    expect(boot.release).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('keeps the reload guard when a chunk fails right after the shell renders (no reload loop)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    sessionStorage.setItem('astrid:preload-reloaded', JSON.stringify({ urls: ['https://cdn.test/old.js'], lastReloadAt: 1 }));
    localStorage.setItem('astrid:welcome-v1', 'complete');
    boot.migrate.mockResolvedValue({ success: true });
    boot.renderApp.mockImplementation((root: HTMLElement) => root.append(document.createElement('section')));
    window.history.replaceState({}, '', '/tools/video-editor?localTest=1');

    await import('@/app/main');
    await vi.waitFor(() => expect(document.querySelector('#root section')).not.toBeNull());
    window.dispatchEvent(Object.assign(new Event('vite:preloadError', { cancelable: true }), { payload: new Error('Failed to fetch dynamically imported module: https://cdn.test/old.js') }));
    vi.advanceTimersByTime(10_000);
    expect(JSON.parse(sessionStorage.getItem('astrid:preload-reloaded')!)).toEqual({ urls: ['https://cdn.test/old.js'], lastReloadAt: 1 });
    expect(reload).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('reloads a failed chunk once and never reloads the same URL again in the session', async () => {
    boot.migrate.mockResolvedValue({ success: false, store: 'x' });
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    await import('@/app/main');
    const failedChunk = (url: string) => Object.assign(new Event('vite:preloadError', { cancelable: true }), { payload: new Error(`Failed to fetch dynamically imported module: ${url}`) });
    const first = failedChunk('https://cdn.test/a.js');
    window.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
    expect(JSON.parse(sessionStorage.getItem('astrid:preload-reloaded')!).urls).toEqual(['https://cdn.test/a.js']);
    vi.spyOn(Date, 'now').mockReturnValue(12_000);
    const second = failedChunk('https://cdn.test/a.js');
    window.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
    const different = failedChunk('https://cdn.test/b.js');
    window.dispatchEvent(different);
    expect(different.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
