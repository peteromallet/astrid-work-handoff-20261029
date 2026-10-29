import { describe, expect, it, vi } from 'vitest';
import {
  isRuntimeDocumentMode,
  normalizeRuntimeDocumentUrl,
  withRuntimeDocumentParams,
} from './runtimeDocument';

describe('canonical Runtime document URLs', () => {
  it('recognizes canonical document identity and the editor chooser', () => {
    expect(isRuntimeDocumentMode('?project=p1&timeline=t1', '/tools/video-editor')).toBe(true);
    expect(isRuntimeDocumentMode('?project=p1', '/tools/image-generation')).toBe(true);
    expect(isRuntimeDocumentMode('', '/tools/video-editor')).toBe(true);
    expect(isRuntimeDocumentMode('?project=p1', '/settings')).toBe(false);
  });

  it('carries canonical identity and unrelated parameters to another tool route', () => {
    expect(withRuntimeDocumentParams(
      '/tools/image-generation?filter=video',
      '?project=p1&timeline=t1&addGenerationId=g1',
    )).toBe('/tools/image-generation?filter=video&addGenerationId=g1&project=p1&timeline=t1');
  });

  it('normalizes local slugs and timeline aliases while preserving intent and hash', async () => {
    window.history.replaceState({}, '', '/tools/video-editor?localProject=slug-a&localTimeline=alias-a&filter=video#shot-1');
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const client = {
      listProjects: vi.fn(async () => [{ project_id: 'project-a', slug: 'slug-a' }]),
      listTimelines: vi.fn(async () => [{ timeline_id: 'timeline-a', timeline_ulid: 'alias-a' }]),
    };

    await normalizeRuntimeDocumentUrl(client);

    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(window.location.pathname + window.location.search + window.location.hash)
      .toBe('/tools/video-editor?filter=video&project=project-a&timeline=timeline-a#shot-1');
  });

  it('normalizes the full runtime=1 legacy document shape', async () => {
    window.history.replaceState({}, '', '/tools/video-editor?runtime=1&runtimeProject=slug-a&runtimeTimeline=alias-a');
    const client = {
      listProjects: vi.fn(async () => [{ project_id: 'project-a', slug: 'slug-a' }]),
      listTimelines: vi.fn(async () => [{ timeline_id: 'timeline-a', timeline_ulid: 'alias-a' }]),
    };

    await normalizeRuntimeDocumentUrl(client);

    expect(window.location.search).toBe('?project=project-a&timeline=timeline-a');
  });

  it('normalizes slug selectors on canonical keys and prefers identity matches over aliases', async () => {
    window.history.replaceState({}, '', '/tools/video-editor?project=slug-a&timeline=alias-a');
    const client = {
      listProjects: vi.fn(async () => [{ project_id: 'project-a', slug: 'slug-a' }]),
      listTimelines: vi.fn(async () => [{ timeline_id: 'timeline-a', timeline_ulid: 'alias-a' }]),
    };
    const replace = vi.fn((href: string) => window.history.replaceState({}, '', href));

    await normalizeRuntimeDocumentUrl(client, window.location, replace);

    expect(client.listTimelines).toHaveBeenCalledWith('project-a');
    expect(replace).toHaveBeenCalledWith('/tools/video-editor?project=project-a&timeline=timeline-a');
  });

  it('prefers canonical IDs over colliding project and timeline aliases', async () => {
    window.history.replaceState({}, '', '/tools/video-editor?project=project-canonical&timeline=timeline-canonical');
    const client = {
      listProjects: vi.fn(async () => [
        { project_id: 'project-other', slug: 'project-canonical' },
        { project_id: 'project-canonical', slug: 'other-project' },
      ]),
      listTimelines: vi.fn(async () => [
        { timeline_id: 'timeline-other', timeline_ulid: 'timeline-canonical' },
        { timeline_id: 'timeline-canonical', timeline_ulid: 'other-timeline' },
      ]),
    };
    const replace = vi.fn((href: string) => window.history.replaceState({}, '', href));

    await normalizeRuntimeDocumentUrl(client, window.location, replace);

    expect(client.listTimelines).toHaveBeenCalledWith('project-canonical');
    expect(replace).not.toHaveBeenCalled();
  });

  it('does not resolve timeline aliases from another project or archived rows', async () => {
    window.history.replaceState({}, '', '/tools/video-editor?project=slug-a&timeline=shared-alias');
    const client = {
      listProjects: vi.fn(async () => [
        { project_id: 'project-a', slug: 'slug-a' },
        { project_id: 'archived-project', slug: 'archived-slug', archived: true },
      ]),
      listTimelines: vi.fn(async () => [
        { project_id: 'project-b', timeline_id: 'wrong-timeline', timeline_ulid: 'shared-alias' },
        { project_id: 'project-a', timeline_id: 'archived-timeline', timeline_ulid: 'shared-alias', archived: true },
      ]),
    };

    await normalizeRuntimeDocumentUrl(client);

    expect(window.location.search).toBe('?project=project-a&timeline=shared-alias');
  });

  it('lets canonical values win per key and Runtime legacy selectors win otherwise', async () => {
    window.history.replaceState({}, '', '/tools/video-editor?project=canonical&runtime=1&runtimeProject=runtime&localProject=local&runtimeTimeline=t-runtime&localTimeline=t-local');
    const client = {
      listProjects: vi.fn(async () => []),
      listTimelines: vi.fn(async () => []),
    };

    await normalizeRuntimeDocumentUrl(client);

    expect(new URLSearchParams(window.location.search).get('project')).toBe('canonical');
    expect(new URLSearchParams(window.location.search).get('timeline')).toBe('t-runtime');
  });

  it('treats present but blank canonical keys as authoritative over legacy values', async () => {
    window.history.replaceState({}, '', '/tools/video-editor?project=&localProject=must-not-win&timeline=&localTimeline=must-not-win');
    const client = { listProjects: vi.fn(), listTimelines: vi.fn() };

    await normalizeRuntimeDocumentUrl(client);

    expect(window.location.search).toBe('');
    expect(client.listProjects).not.toHaveBeenCalled();
  });

  it('does not use ignored Runtime selectors when the legacy runtime flag is absent', async () => {
    window.history.replaceState({}, '', '/tools/video-editor?runtimeProject=ignored-runtime&runtimeTimeline=ignored-timeline&localProject=local&localTimeline=local-timeline');
    const client = {
      listProjects: vi.fn(async () => []),
      listTimelines: vi.fn(),
    };

    await normalizeRuntimeDocumentUrl(client);

    expect(window.location.search).toBe('?project=local&timeline=local-timeline');
    expect(client.listTimelines).not.toHaveBeenCalled();
  });

  it('keeps explicit unknown selections as canonical error selections', async () => {
    window.history.replaceState({}, '', '/tools/video-editor?localProject=missing&localTimeline=missing-timeline');
    const client = {
      listProjects: vi.fn(async () => []),
      listTimelines: vi.fn(),
    };

    await normalizeRuntimeDocumentUrl(client);

    expect(window.location.search).toBe('?project=missing&timeline=missing-timeline');
    expect(client.listTimelines).not.toHaveBeenCalled();
  });

  it('leaves the original selection intact when Runtime resolution fails', async () => {
    window.history.replaceState({}, '', '/tools/video-editor?localProject=slug-a&localTimeline=alias-a&filter=video#shot-1');
    const original = window.location.pathname + window.location.search + window.location.hash;
    const client = {
      listProjects: vi.fn(async () => { throw new Error('Runtime discovery failed'); }),
      listTimelines: vi.fn(),
    };

    await expect(normalizeRuntimeDocumentUrl(client)).rejects.toThrow('Runtime discovery failed');
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(original);
  });

  it('does not replace after navigation changes while identity resolution is pending', async () => {
    window.history.replaceState({}, '', '/tools/video-editor?localProject=slug-a');
    const client = {
      listProjects: vi.fn(async () => [{ project_id: 'project-a', slug: 'slug-a' }]),
      listTimelines: vi.fn(async () => []),
    };
    const replace = vi.fn();

    await normalizeRuntimeDocumentUrl(client, window.location, replace, () => false);

    expect(replace).not.toHaveBeenCalled();
  });

  it('does not normalize legacy selectors on non-document routes', async () => {
    window.history.replaceState({}, '', '/settings?localProject=slug-a');
    const client = { listProjects: vi.fn(), listTimelines: vi.fn() };

    expect(await normalizeRuntimeDocumentUrl(client)).toBe(false);
    expect(window.location.search).toBe('?localProject=slug-a');
    expect(client.listProjects).not.toHaveBeenCalled();
  });

  it('does not overwrite navigation while resolving a live window Location', async () => {
    window.history.replaceState({}, '', '/tools/video-editor?localProject=old-slug');
    let resolveProjects!: (rows: Array<{ project_id: string; slug: string }>) => void;
    const client = {
      listProjects: vi.fn(() => new Promise<Array<{ project_id: string; slug: string }>>((resolve) => { resolveProjects = resolve; })),
      listTimelines: vi.fn(),
    };
    const replace = vi.fn();
    const normalization = normalizeRuntimeDocumentUrl(client, window.location, replace);
    window.history.replaceState({}, '', '/tools/video-editor?project=new-project#new-shot');
    resolveProjects([{ project_id: 'old-project', slug: 'old-slug' }]);

    expect(await normalization).toBe(false);
    expect(replace).not.toHaveBeenCalled();
    expect(window.location.search + window.location.hash).toBe('?project=new-project#new-shot');
  });
});
