import { arrayMove } from '@dnd-kit/sortable';
import type { TransitionPrompt, VideoClip } from '../../clipTypes';

interface ReorderResult {
  clips: VideoClip[];
  transitionPrompts: TransitionPrompt[];
}

export function reorderClipsAndPrompts(
  clips: VideoClip[],
  transitionPrompts: TransitionPrompt[],
  activeId: string | number,
  overId: string | number,
): ReorderResult {
  const oldIndex = clips.findIndex(clip => clip.id === activeId);
  const newIndex = clips.findIndex(clip => clip.id === overId);

  if (oldIndex === -1 || newIndex === -1) {
    return { clips, transitionPrompts };
  }

  const newClips = arrayMove(clips, oldIndex, newIndex);

  const newPrompts = transitionPrompts.map(prompt => {
    const oldClipIndex = clips.findIndex(c => c.id === prompt.id);
    if (oldClipIndex !== -1 && oldClipIndex > 0) {
      const newClipIndex = newClips.findIndex(c => c.id === clips[oldClipIndex].id);
      if (newClipIndex > 0) {
        return { ...prompt, id: newClips[newClipIndex].id };
      }
    }
    return prompt;
  });

  return { clips: newClips, transitionPrompts: newPrompts };
}
