import { useSyncExternalStore } from 'react';

/**
 * How this viewer listens to and watches the preview: listening volume, mute and playback
 * speed. They belong to the person at this screen, never to the timeline, so they
 * change only the preview Player (Remotion multiplies its own volume into every clip's level)
 * and never the timeline's audio levels or an export.
 *
 * Volume and mute are remembered on this device, the way a video site remembers them. Speed
 * lasts for the session: a film that plays fast on the next visit would surprise.
 */
export interface PreviewPlaybackPreferences {
  /** Listening level, 0 to 1. */
  volume: number;
  muted: boolean;
  /** Player speed; 1 is real time. */
  rate: number;
}

export const PREVIEW_PLAYBACK_STORAGE_KEY = 'astrid:previewPlayback';
export const PREVIEW_PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

const DEFAULT_PREFERENCES: PreviewPlaybackPreferences = { volume: 1, muted: false, rate: 1 };

function clampVolume(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;
}

function readStored(): PreviewPlaybackPreferences {
  try {
    const raw = window.localStorage.getItem(PREVIEW_PLAYBACK_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as { volume?: unknown; muted?: unknown };
    return {
      ...DEFAULT_PREFERENCES,
      volume: clampVolume(parsed.volume) ?? DEFAULT_PREFERENCES.volume,
      muted: parsed.muted === true,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function writeStored({ volume, muted }: PreviewPlaybackPreferences): void {
  try {
    window.localStorage.setItem(PREVIEW_PLAYBACK_STORAGE_KEY, JSON.stringify({ volume, muted }));
  } catch {
    // Private windows and blocked storage keep the choice for this page only.
  }
}

let current: PreviewPlaybackPreferences | null = null;
const listeners = new Set<() => void>();

export function getPreviewPlaybackPreferences(): PreviewPlaybackPreferences {
  if (current === null) current = typeof window === 'undefined' ? DEFAULT_PREFERENCES : readStored();
  return current;
}

export function setPreviewPlaybackPreferences(patch: Partial<PreviewPlaybackPreferences>): void {
  const previous = getPreviewPlaybackPreferences();
  const volume = patch.volume === undefined ? previous.volume : (clampVolume(patch.volume) ?? previous.volume);
  const rate = patch.rate !== undefined && Number.isFinite(patch.rate) && patch.rate > 0 ? patch.rate : previous.rate;
  const next = { ...previous, ...patch, volume, rate };
  if (next.volume === previous.volume && next.muted === previous.muted && next.rate === previous.rate) return;
  current = next;
  if (next.volume !== previous.volume || next.muted !== previous.muted) writeStored(next);
  for (const listener of listeners) listener();
}

/** Mute toggles back to the last audible level; unmuting at zero brings the level back to half. */
export function togglePreviewMuted(): void {
  const { muted, volume } = getPreviewPlaybackPreferences();
  if (muted || volume === 0) setPreviewPlaybackPreferences({ muted: false, volume: volume === 0 ? 0.5 : volume });
  else setPreviewPlaybackPreferences({ muted: true });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePreviewPlaybackPreferences(): PreviewPlaybackPreferences {
  return useSyncExternalStore(subscribe, getPreviewPlaybackPreferences, getPreviewPlaybackPreferences);
}

/** Tests only: forget the in-memory copy so the next read comes from storage again. */
export function resetPreviewPlaybackPreferencesForTests(): void {
  current = null;
}
