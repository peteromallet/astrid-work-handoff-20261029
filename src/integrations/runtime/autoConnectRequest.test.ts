// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { consumeAutoConnectQuery, linkForSupportedBrowser } from './autoConnectRequest.ts';

afterEach(() => {
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('installer auto-connect link', () => {
  it('removes connect=1 from this tab while retaining it for the supported-browser link', () => {
    window.history.replaceState({}, '', '/tools/video-editor?timeline=first&connect=1#frame=42');

    expect(consumeAutoConnectQuery()).toBe(true);
    expect(window.location.href).not.toContain('connect=1');
    expect(linkForSupportedBrowser()).toBe(`${window.location.origin}/tools/video-editor?timeline=first&connect=1#frame=42`);
  });

  it('does not add an installer entry flag to an ordinary page link', () => {
    window.history.replaceState({}, '', '/tools/video-editor?timeline=first#frame=42');

    expect(linkForSupportedBrowser()).toBe(`${window.location.origin}/tools/video-editor?timeline=first#frame=42`);
  });
});
