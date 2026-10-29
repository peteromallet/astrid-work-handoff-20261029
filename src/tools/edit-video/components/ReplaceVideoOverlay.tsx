import { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { SEGMENT_OVERLAY_COLORS } from '@/shared/lib/segmentColors';
import type { PortionSelection } from '@/shared/components/VideoPortionTimeline';
import { getRegenerationZoneInfo } from '@/shared/lib/video/regenerationZoneInfo';

/**
 * Renders the replace-mode-specific video overlay (segment info badge + delete button).
 * Intended to be placed inside the playhead overlay div by the parent.
 */
export function ReplaceVideoOverlay({
  currentVideoTime,
  selections,
  onRemoveSelection,
}: {
  currentVideoTime: number;
  selections: PortionSelection[];
  onRemoveSelection: (id: string) => void;
}) {
  // Check if current time is in a regeneration zone and which segment
  const regenerationZoneInfo = useMemo(() => {
    return getRegenerationZoneInfo(currentVideoTime, selections);
  }, [currentVideoTime, selections]);

  return (
    <>
      {' '}
      <span className={cn(
        "px-1.5 py-0.5 rounded text-[10px] ml-1",
        regenerationZoneInfo.inZone
          ? SEGMENT_OVERLAY_COLORS[regenerationZoneInfo.segmentIndex % SEGMENT_OVERLAY_COLORS.length].bg + ' ' + SEGMENT_OVERLAY_COLORS[regenerationZoneInfo.segmentIndex % SEGMENT_OVERLAY_COLORS.length].text
          : "bg-white/20 text-white/70"
      )}>
        {regenerationZoneInfo.inZone ? `segment ${regenerationZoneInfo.segmentIndex + 1}` : 'keep'}
      </span>
      {/* Delete button - only show when in a segment and there's more than 1 */}
      {regenerationZoneInfo.inZone && selections.length > 1 && (
        <button
          onClick={() => {
            if (regenerationZoneInfo.selection?.id) {
              onRemoveSelection(regenerationZoneInfo.selection.id);
            }
          }}
          className="ml-1 p-0.5 rounded hover:bg-white/20 text-white/50 hover:text-white transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </>
  );
}
