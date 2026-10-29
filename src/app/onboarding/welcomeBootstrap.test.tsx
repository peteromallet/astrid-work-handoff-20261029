import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const failure = vi.hoisted(() => ({ error: new Error('Failed to fetch dynamically imported module: /assets/WelcomeConnection-old.js') }));
vi.mock('./BrowserTourEditor', () => ({ BrowserTourEditor: () => <h1>Tour</h1> }));
// A vi.mock factory that throws is re-wrapped by vitest (the message is lost), so the module
// instead fails when React reads its default export, which surfaces the same error to the boundary.
vi.mock('./WelcomeConnection', () => ({ get default(): never { throw failure.error; } }));

describe('welcome root error handling', () => {
  let root: HTMLElement;
  beforeEach(() => {
    localStorage.clear();
    // The visitor has finished the tour and is on the connection phase.
    localStorage.setItem('astrid:welcome-v1', 'connection');
    window.history.replaceState({}, '', '/tools/video-editor');
    root = document.createElement('div');
    document.body.replaceChildren(root);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  async function mount(): Promise<void> {
    // lazy() caches its rejection per module instance, so each case loads a fresh module graph.
    vi.resetModules();
    const { renderWelcome } = await import('./welcomeBootstrap');
    await act(async () => { renderWelcome(root, 'connection'); });
    await vi.waitFor(() => expect(root.querySelector('button')).not.toBeNull());
  }

  it('shows an update notice with Reload, without auto-reloading, when the connection chunk is gone', async () => {
    failure.error = new Error('Failed to fetch dynamically imported module: /assets/WelcomeConnection-old.js');
    await mount();
    expect(root.textContent).toContain('Astrid was updated');
    expect(screen_buttons(root)).toContain('Reload');
  });

  it('shows a visible error with Reload for any other failure', async () => {
    failure.error = new Error('boom');
    await mount();
    expect(root.textContent).toContain('Something went wrong');
    expect(screen_buttons(root)).toContain('Reload');
  });
});

function screen_buttons(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('button')).map(b => b.textContent ?? '');
}
