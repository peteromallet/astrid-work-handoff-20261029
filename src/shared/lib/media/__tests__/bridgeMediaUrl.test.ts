import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bridgeMediaUrl } from '../bridgeMediaUrl';
import { FIXTURE_PROJECT } from '@/test/fakeRuntimeSeed.mjs';

describe('bridgeMediaUrl', () => {
  it('addresses a managed media id via the workspace.v1 object route', () => {
    expect(bridgeMediaUrl(FIXTURE_PROJECT.slug, '01j8zcex4q7m4sjdy6g6mediapngaaa'))
      .toBe('/api/astrid/v1/objects/01j8zcex4q7m4sjdy6g6mediapngaaa');
  });

  it('honors an explicit base url and trims trailing slashes', () => {
    expect(bridgeMediaUrl('demo-project', 'media01', 'http://127.0.0.1:17333/'))
      .toBe('http://127.0.0.1:17333/v1/objects/media01');
  });

  it('passes absolute urls through untouched', () => {
    const absolute = 'https://example.test/some/object.mp4';
    expect(bridgeMediaUrl(FIXTURE_PROJECT.slug, absolute)).toBe(absolute);
    expect(bridgeMediaUrl(FIXTURE_PROJECT.slug, 'blob:https://app.test/abc')).toBe('blob:https://app.test/abc');
    expect(bridgeMediaUrl(FIXTURE_PROJECT.slug, 'data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
  });

  it('passes already-rooted route addresses through untouched (idempotent)', () => {
    const rooted = `/api/astrid/projects/${FIXTURE_PROJECT.slug}/media/media01/content`;
    expect(bridgeMediaUrl(FIXTURE_PROJECT.slug, rooted)).toBe(rooted);
  });

  it('keeps the placeholder contract for empty references', () => {
    expect(bridgeMediaUrl(FIXTURE_PROJECT.slug, null)).toBe('/placeholder.svg');
    expect(bridgeMediaUrl(FIXTURE_PROJECT.slug, undefined)).toBe('/placeholder.svg');
    expect(bridgeMediaUrl(FIXTURE_PROJECT.slug, '')).toBe('/placeholder.svg');
  });

  it('hands raw references back when no project scope is known', () => {
    expect(bridgeMediaUrl(null, 'media01')).toBe('media01');
    expect(bridgeMediaUrl(undefined, 'media01')).toBe('media01');
  });
});

describe('bridgeMediaUrl on the hosted build (gateway origin)', () => {
  const GATEWAY = 'http://127.0.0.1:17340';

  beforeEach(() => {
    vi.resetModules();
  });

  async function withGateway() {
    const connection = await import('@/integrations/runtime/connection.ts');
    // Loaded first, as the App does: the origin arrives after the helper module exists.
    const media = await import('../bridgeMediaUrl');
    connection.setRuntimeOrigin({ VITE_RUNTIME_ORIGIN: GATEWAY });
    return media.bridgeMediaUrl;
  }

  it('addresses a managed media id under the gateway', async () => {
    const bridgeMediaUrl = await withGateway();
    expect(bridgeMediaUrl('demo-project', 'media01'))
      .toBe(`${GATEWAY}/api/astrid/v1/objects/media01`);
  });

  it('addresses a content digest under the gateway', async () => {
    const bridgeMediaUrl = await withGateway();
    expect(bridgeMediaUrl('demo-project', 'sha256:abc'))
      .toBe(`${GATEWAY}/api/astrid/v1/objects/sha256%3Aabc`);
  });

  it('still honors an explicit base, passes absolute and rooted references through, and keeps placeholders', async () => {
    const bridgeMediaUrl = await withGateway();
    expect(bridgeMediaUrl('demo-project', 'media01', 'http://127.0.0.1:17333/'))
      .toBe('http://127.0.0.1:17333/v1/objects/media01');
    expect(bridgeMediaUrl('demo-project', `${GATEWAY}/api/astrid/v1/objects/sha256%3Aabc`))
      .toBe(`${GATEWAY}/api/astrid/v1/objects/sha256%3Aabc`);
    expect(bridgeMediaUrl('demo-project', '/api/astrid/projects/demo-project/media/media01/content'))
      .toBe('/api/astrid/projects/demo-project/media/media01/content');
    expect(bridgeMediaUrl('demo-project', null)).toBe('/placeholder.svg');
    expect(bridgeMediaUrl(null, 'media01')).toBe('media01');
  });
});
