import { ArrowDown, ArrowUp, FoldHorizontal, MoveHorizontal, Scissors, Volume2, VolumeX, type LucideIcon } from 'lucide-react';
import { Button } from '@/shared/components/ui/button.tsx';
import type { ClipTab } from '@/tools/video-editor/hooks/useEditorPreferences.ts';

/**
 * The clip's action grid on touch devices, where it is the one way to move,
 * trim, split, mute or change the track of a clip (delete sits in the clip
 * header). Move and Trim arm the gesture for a direct drag; the shell shows
 * Done until it is released. An action the clip's type cannot do is not shown
 * (a text clip has no Mute), rather than shown disabled; one that has nowhere to
 * go now (Track up on the top track) is disabled.
 */
export function ClipInspectorActions({
  muted,
  canMoveTrack,
  canSplit,
  canToggleMute,
  setActiveTab,
  onSetInteractionMode,
  onMoveTrackUp,
  onMoveTrackDown,
  onSplitAtPlayhead,
  onToggleMute,
}: {
  muted: boolean;
  canMoveTrack: boolean;
  canSplit: boolean;
  canToggleMute: boolean;
  setActiveTab: (tab: ClipTab) => void;
  onSetInteractionMode: (mode: 'move' | 'trim') => void;
  /** Absent at the top: there is no track of the clip's kind above. */
  onMoveTrackUp?: () => void;
  /** Absent at the bottom: there is no track of the clip's kind below. */
  onMoveTrackDown?: () => void;
  onSplitAtPlayhead: () => void;
  onToggleMute: () => void;
}) {
  const actions: ReadonlyArray<{ label: string; icon: LucideIcon; onClick?: () => void; applies: boolean }> = [
    { label: 'Move', icon: MoveHorizontal, onClick: () => { onSetInteractionMode('move'); setActiveTab('timing'); }, applies: true },
    { label: 'Trim', icon: FoldHorizontal, onClick: () => { onSetInteractionMode('trim'); setActiveTab('timing'); }, applies: true },
    { label: 'Split', icon: Scissors, onClick: onSplitAtPlayhead, applies: canSplit },
    { label: muted ? 'Unmute' : 'Mute', icon: muted ? Volume2 : VolumeX, onClick: onToggleMute, applies: canToggleMute },
    { label: 'Track up', icon: ArrowUp, onClick: onMoveTrackUp, applies: canMoveTrack },
    { label: 'Track down', icon: ArrowDown, onClick: onMoveTrackDown, applies: canMoveTrack },
  ];
  return (
    // One row where the Inspector is wide (iPad); three across on a phone.
    <div className="@container">
      <div className="grid grid-cols-3 gap-2 @[34rem]:grid-cols-6" role="group" aria-label="Clip actions" data-astrid-inspector-actions="clip">
        {actions.filter(({ applies }) => applies).map(({ label, icon: Icon, onClick }) => (
          <Button
            key={label}
            type="button"
            variant="outline"
            className="h-14 flex-col gap-1 px-1 text-[11px] font-normal"
            onClick={onClick}
            disabled={!onClick}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
