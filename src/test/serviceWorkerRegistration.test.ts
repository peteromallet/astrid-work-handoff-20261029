import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

const indexHtml = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
const cleanupScript = [...indexHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  .find(([, attributes, source]) => !attributes.includes('src') && source.includes('getRegistrations'))?.[2];
function runCleanupScript(withServiceWorker: boolean) {
  if (!cleanupScript) throw new Error('Service worker cleanup script not found');
  const dom = new JSDOM('<div id="boot"></div><div id="root"></div><script type="module" src="/assets/index-abc.js"></script>', {
    url: 'http://localhost/tools/video-editor',
    runScripts: 'outside-only',
  });
  const browser = dom.window as unknown as Window & typeof globalThis;
  const appRegistration = {
    active: { scriptURL: `${browser.location.origin}/sw.js` },
    unregister: vi.fn().mockResolvedValue(true),
  };
  const otherRegistration = {
    active: { scriptURL: `${browser.location.origin}/other-worker.js` },
    unregister: vi.fn().mockResolvedValue(true),
  };
  const serviceWorker = {
    getRegistrations: vi.fn().mockResolvedValue([appRegistration, otherRegistration]),
    register: vi.fn(),
  };
  const cacheDelete = vi.fn().mockResolvedValue(true);

  if (withServiceWorker) {
    Object.defineProperty(browser.navigator, 'serviceWorker', { configurable: true, value: serviceWorker });
  }
  Object.defineProperty(browser, 'caches', {
    configurable: true,
    value: { keys: vi.fn().mockResolvedValue(['astrid-v4', 'other-cache']), delete: cacheDelete },
  });
  browser.eval(cleanupScript);
  return { dom, browser, appRegistration, otherRegistration, serviceWorker, cacheDelete };
}

describe('service worker retirement', () => {
  it('does not register a worker when no existing app worker is present', async () => {
    const { dom, serviceWorker, cacheDelete } = runCleanupScript(false);
    expect(cleanupScript).not.toContain('.register(');
    await vi.waitFor(() => expect(cacheDelete).toHaveBeenCalledWith('astrid-v4'));
    expect(serviceWorker.register).not.toHaveBeenCalled();
    dom.window.close();
  });

  it('unregisters only this app worker and deletes this app caches', async () => {
    const { dom, appRegistration, otherRegistration, serviceWorker, cacheDelete } = runCleanupScript(true);
    await vi.waitFor(() => expect(appRegistration.unregister).toHaveBeenCalledOnce());
    expect(otherRegistration.unregister).not.toHaveBeenCalled();
    expect(serviceWorker.register).not.toHaveBeenCalled();
    expect(cacheDelete).toHaveBeenCalledOnce();
    expect(cacheDelete).toHaveBeenCalledWith('astrid-v4');
    dom.window.close();
  });

  it('shows the entry-load fallback and releases the boot layer from the script error event', () => {
    const { dom, browser } = runCleanupScript(false);
    const entry = browser.document.querySelector('script[type="module"]')!;
    entry.dispatchEvent(new browser.Event('error'));
    expect(browser.document.getElementById('root')?.textContent).toContain('Astrid could not load');
    expect(browser.document.querySelector('#root a')?.getAttribute('href')).toBe(browser.location.href);
    expect(browser.document.getElementById('boot')).toBeNull();
    dom.window.close();
  });

  it('deletes app caches and unregisters on activate without navigating clients', async () => {
    const swSource = fs.readFileSync(path.resolve(__dirname, '../../public/sw.js'), 'utf8');
    const listeners = new Map<string, (event: { waitUntil(promise: Promise<unknown>): void }) => void>();
    const cacheDelete = vi.fn().mockResolvedValue(true);
    const unregister = vi.fn().mockResolvedValue(true);
    const self = {
      addEventListener: (name: string, listener: (event: { waitUntil(promise: Promise<unknown>): void }) => void) => listeners.set(name, listener),
      registration: { unregister },
      clients: { navigate: vi.fn(), claim: vi.fn() },
    };
    const caches = { keys: vi.fn().mockResolvedValue(['astrid-v4', 'unrelated']), delete: cacheDelete };
    new Function('self', 'caches', swSource)(self, caches);

    let activation: Promise<unknown> | undefined;
    listeners.get('activate')?.({ waitUntil: (promise) => { activation = promise; } });
    await activation;
    expect(cacheDelete).toHaveBeenCalledOnce();
    expect(cacheDelete).toHaveBeenCalledWith('astrid-v4');
    expect(unregister).toHaveBeenCalledOnce();
    expect(self.clients.navigate).not.toHaveBeenCalled();
    expect(self.clients.claim).not.toHaveBeenCalled();
  });
});
