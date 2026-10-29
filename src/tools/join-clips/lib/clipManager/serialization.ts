import type { TransitionPrompt, VideoClip } from '../../clipTypes';

export function buildClipsToSave(
  clips: VideoClip[],
): Array<{ url: string; posterUrl?: string; finalFrameUrl?: string; durationSeconds?: number }> {
  return clips
    .filter(clip => clip.url)
    .map(clip => ({
      url: clip.url,
      posterUrl: clip.posterUrl,
      finalFrameUrl: clip.finalFrameUrl,
      durationSeconds: clip.durationSeconds,
    }));
}

export function buildPromptsToSave(
  clips: VideoClip[],
  transitionPrompts: TransitionPrompt[],
): Array<{ clipIndex: number; prompt: string }> {
  return transitionPrompts
    .map(tp => {
      const clipIndex = clips.findIndex(c => c.id === tp.id);
      if (clipIndex > 0 && tp.prompt) {
        return { clipIndex, prompt: tp.prompt };
      }
      return null;
    })
    .filter((p): p is { clipIndex: number; prompt: string } => p !== null);
}
