import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPreviewPlaybackPreferences,
  PREVIEW_PLAYBACK_STORAGE_KEY,
  resetPreviewPlaybackPreferencesForTests,
  setPreviewPlaybackPreferences,
  togglePreviewMuted,
} from './previewPlaybackPreferences.ts';

beforeEach(() => {
  window.localStorage.clear();
  resetPreviewPlaybackPreferencesForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('previewPlaybackPreferences', () => {
  it('starts with the viewer defaults', () => {
    expect(getPreviewPlaybackPreferences()).toEqual({ volume: 1, muted: false, rate: 1 });
  });

  it('persists volume and mute and reads them again after resetting module state', () => {
    setPreviewPlaybackPreferences({ volume: 0.4, muted: true });

    expect(JSON.parse(window.localStorage.getItem(PREVIEW_PLAYBACK_STORAGE_KEY)!)).toEqual({ volume: 0.4, muted: true });

    resetPreviewPlaybackPreferencesForTests();
    expect(getPreviewPlaybackPreferences()).toEqual({ volume: 0.4, muted: true, rate: 1 });
  });

  it('keeps rate in memory without writing it to storage', () => {
    setPreviewPlaybackPreferences({ rate: 1.5 });

    expect(getPreviewPlaybackPreferences()).toEqual({ volume: 1, muted: false, rate: 1.5 });
    expect(window.localStorage.getItem(PREVIEW_PLAYBACK_STORAGE_KEY)).toBeNull();
  });

  it('falls back on corrupt JSON and clamps numeric volumes from storage', () => {
    window.localStorage.setItem(PREVIEW_PLAYBACK_STORAGE_KEY, '{bad json');
    resetPreviewPlaybackPreferencesForTests();
    expect(getPreviewPlaybackPreferences()).toEqual({ volume: 1, muted: false, rate: 1 });

    window.localStorage.setItem(PREVIEW_PLAYBACK_STORAGE_KEY, JSON.stringify({ volume: 2, muted: true }));
    resetPreviewPlaybackPreferencesForTests();
    expect(getPreviewPlaybackPreferences()).toEqual({ volume: 1, muted: true, rate: 1 });

    window.localStorage.setItem(PREVIEW_PLAYBACK_STORAGE_KEY, JSON.stringify({ volume: -0.25 }));
    resetPreviewPlaybackPreferencesForTests();
    expect(getPreviewPlaybackPreferences().volume).toBe(0);
  });

  it('keeps reads and writes safe when localStorage throws', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw new Error('storage blocked'); });
    expect(getPreviewPlaybackPreferences()).toEqual({ volume: 1, muted: false, rate: 1 });

    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new Error('storage blocked'); });
    expect(() => setPreviewPlaybackPreferences({ volume: 0.35, muted: true })).not.toThrow();
    expect(getPreviewPlaybackPreferences()).toEqual({ volume: 0.35, muted: true, rate: 1 });
  });

  it('toggles mute back to the previous volume and restores half volume from zero', () => {
    setPreviewPlaybackPreferences({ volume: 0.7 });
    togglePreviewMuted();
    expect(getPreviewPlaybackPreferences()).toMatchObject({ volume: 0.7, muted: true });
    togglePreviewMuted();
    expect(getPreviewPlaybackPreferences()).toMatchObject({ volume: 0.7, muted: false });

    setPreviewPlaybackPreferences({ volume: 0 });
    togglePreviewMuted();
    expect(getPreviewPlaybackPreferences()).toMatchObject({ volume: 0.5, muted: false });
  });
});
