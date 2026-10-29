import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Clapperboard, Plus } from 'lucide-react';
import type { Shot } from '@/domains/generation/types';
import { usePortalMousedownGuard } from '@/shared/hooks/usePortalMousedownGuard';

interface SelectionContextMenuProps {
  position: { x: number; y: number } | null;
  onClose: () => void;
  onNavigateToShot?: (shot: Shot) => void;
  onOpenGenerateVideo?: (shot: Shot) => void;
  /** Shots that already contain every selected item. */
  existingShots?: Shot[];
  /** Adds the single selected item to the timeline. Absent: no timeline item. */
  onAddToTimeline?: () => void;
  /** When set, the timeline item is disabled and this explains why. */
  addToTimelineDisabledReason?: string;
}

export function SelectionContextMenu({
  position,
  onClose,
  onNavigateToShot,
  onOpenGenerateVideo,
  existingShots,
  onAddToTimeline,
  addToTimelineDisabledReason,
}: SelectionContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState<{ x: number; y: number } | null>(null);

  // Clamp menu position to viewport after it renders and we know its size
  useLayoutEffect(() => {
    if (!position || !menuRef.current) {
      setAdjustedPos(position);
      return;
    }
    const rect = menuRef.current.getBoundingClientRect();
    const pad = 8;
    const x = Math.min(position.x, window.innerWidth - rect.width - pad);
    const y = Math.min(position.y, window.innerHeight - rect.height - pad);
    setAdjustedPos({ x: Math.max(pad, x), y: Math.max(pad, y) });
  }, [position]);

  usePortalMousedownGuard(menuRef, Boolean(position));

  useEffect(() => {
    if (!position) {
      return undefined;
    }

    const handleClickAway = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickAway);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickAway);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [position, onClose]);

  const hasShots = Boolean(existingShots && existingShots.length > 0);
  if (!position || (!hasShots && !onAddToTimeline)) {
    return null;
  }

  const displayPos = adjustedPos ?? position;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
      style={{ left: displayPos.x, top: displayPos.y }}
    >
      {onAddToTimeline && (
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
          disabled={Boolean(addToTimelineDisabledReason)}
          title={addToTimelineDisabledReason}
          onClick={() => { onAddToTimeline(); onClose(); }}
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Add to timeline</span>
        </button>
      )}
      {existingShots?.map((shot) => (
        <div key={shot.id} className="flex w-full items-center gap-1 rounded-sm px-2 py-1.5 text-sm">
          <span className="min-w-0 flex-1 truncate">{shot.name}</span>
          {onOpenGenerateVideo && (
            <button type="button" className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-accent hover:text-accent-foreground" onClick={() => { onOpenGenerateVideo(shot); onClose(); }} title="Generate Video">
              <Clapperboard className="h-3.5 w-3.5" />
            </button>
          )}
          {onNavigateToShot && (
            <button type="button" className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-accent hover:text-accent-foreground" onClick={() => { onNavigateToShot(shot); onClose(); }} title="Jump to shot">
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}
