import { Film } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import type { ClipPairInfo } from '@/shared/components/JoinClipsSettingsForm/types';
import { mediaCrossOrigin } from '@/shared/lib/media/mediaCrossOrigin';

interface ClipPairSelectorProps {
  clipPairs: ClipPairInfo[];
  selectedPairIndex: number;
  onPairSelect: (index: number) => void;
}

export function ClipPairSelector({
  clipPairs,
  selectedPairIndex,
  onPairSelect,
}: ClipPairSelectorProps) {
  const selectedPair = clipPairs[selectedPairIndex];
  if (!selectedPair) {
    return null;
  }

  const hasMultiplePairs = clipPairs.length > 1;

  return (
    <div className="flex items-center gap-3 mb-4">
      {hasMultiplePairs && (
        <div className="flex items-center gap-1">
          {clipPairs.map((_, index) => (
            <button
              key={index}
              onClick={() => onPairSelect(index)}
              className={cn(
                'px-2 py-1 text-[10px] rounded transition-colors',
                selectedPairIndex === index
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              )}
            >
              Pair {index + 1}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="w-12 h-8 rounded border overflow-hidden bg-muted">
          {selectedPair.clipA.finalFrameUrl ? (
            <img
              src={selectedPair.clipA.finalFrameUrl}
              crossOrigin={mediaCrossOrigin(selectedPair.clipA.finalFrameUrl)}
              alt={selectedPair.clipA.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <Film className="w-3 h-3" />
            </div>
          )}
        </div>
        <span className="text-muted-foreground text-[10px]">→</span>
        <div className="w-12 h-8 rounded border overflow-hidden bg-muted">
          {selectedPair.clipB.posterUrl ? (
            <img
              src={selectedPair.clipB.posterUrl}
              crossOrigin={mediaCrossOrigin(selectedPair.clipB.posterUrl)}
              alt={selectedPair.clipB.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <Film className="w-3 h-3" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
