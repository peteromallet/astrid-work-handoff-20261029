import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { localStorage.clear(); vi.resetModules(); });

describe('welcome entry', () => {
  it.each([
    ['/tools/video-editor', null, 'tour'],
    ['/tools/video-editor?foo=1', 'choose', 'choose'],
    ['/tools/video-editor?connect=1', 'tour', 'connection'],
    ['/tools/video-editor?connect=1', 'complete', 'connection'],
    ['/tools/video-editor?connect=1', null, 'connection'],
    ['/tools/video-editor?connect=1', 'local', 'local'],
    ['/tools/video-editor?project=p', 'tour', 'editor'],
    ['/tools/video-editor?timeline=t', 'tour', 'editor'],
    ['/tools/video-editor?localProject=p', 'tour', 'editor'],
    ['/tools/video-editor?localTimeline=t', 'tour', 'editor'],
    ['/tools/video-editor?project=p&connect=1', 'tour', 'editor'],
    ['/tools/video-editor?entry=editor', null, 'editor'],
    ['/tools/video-editor?entry=editor', 'tour', 'editor'],
    ['/tools/video-editor?entry=editor', 'local', 'editor'],
    ['/tools/video-editor?connect=0', 'local', 'local'],
    ['/tools/video-editor?connect=1', 'local', 'local', true],
    ['/tools/video-editor', 'tour', 'tour', true],
    ['/tools/video-editor', 'choose', 'connection', true],
    ['/tools/video-editor', 'local', 'local', true],
    ['/tools/video-editor?project=p', 'choose', 'editor', true],
    ['/tools/video-editor', 'complete', 'editor'],
    ['/tools/other', 'tour', 'editor'],
  ] as const)('routes %s at %s to %s', async (path, phase, expected, localBuild = false) => {
    const { entryFor } = await import('./welcomeProgress');
    expect(entryFor(new URL(`https://astrid.haus${path}`), phase, localBuild)).toBe(expected);
  });

  it.each(['astrid.runtime.connectedBefore', 'astrid-setup-complete', 'astrid-editor-tour-v1', 'astrid:lastOpenedLocalProjectSlug'])('normalizes legacy marker %s once', async key => {
    localStorage.setItem(key, 'present');
    const { readWelcomePhase } = await import('./welcomeProgress');
    expect(readWelcomePhase()).toBe('complete');
    expect(localStorage.getItem('astrid:welcome-v1')).toBe('complete');
  });

  it('advances the phase record and only writes that record on completion', async () => {
    const progress = await import('./welcomeProgress');
    for (const phase of ['tour', 'choose', 'connection', 'local'] as const) {
      progress.writeWelcomePhase(phase);
      expect(progress.readWelcomePhase()).toBe(phase);
    }
    progress.writeWelcomePhase(null);
    expect(progress.readWelcomePhase()).toBeNull();
    expect(localStorage.getItem('astrid:welcome-v1')).toBeNull();
    progress.writeWelcomePhase('local');
    expect(progress.completeWelcome({ projectId: 'p', timelineId: 't' })).toBe('/tools/video-editor?project=p&timeline=t');
    expect(localStorage.getItem('astrid:welcome-v1')).toBe('complete');
    expect(localStorage.getItem('astrid-setup-complete')).toBeNull();
    expect(localStorage.getItem('astrid-editor-tour-v1')).toBeNull();
  });

  it('continues in memory when browser storage is blocked', async () => {
    const progress = await import('./welcomeProgress');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    progress.writeWelcomePhase('local');
    expect(progress.readWelcomePhase()).toBe('local');
    expect(progress.entryFor(new URL('https://astrid.haus/tools/video-editor'), progress.readWelcomePhase())).toBe('local');
  });

  it('opens the editor from its explicit URL when storage is unavailable in a fresh module', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const progress = await import('./welcomeProgress');
    const target = progress.completeWelcome();
    vi.resetModules();
    const freshProgress = await import('./welcomeProgress');

    expect(target).toBe('/tools/video-editor?entry=editor');
    expect(freshProgress.readWelcomePhase()).toBeNull();
    expect(freshProgress.entryFor(new URL(`https://astrid.haus${target}`), freshProgress.readWelcomePhase())).toBe('editor');
  });
});
