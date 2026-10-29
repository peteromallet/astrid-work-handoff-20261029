import { Button } from '@/shared/components/ui/button';
import { Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { formatTime } from '@/shared/lib/timeFormatting';

interface VideoPlayerControlsProps {
  isPlaying: boolean;
  showControls: boolean;
  isMuted: boolean;
  currentTime: number;
  duration: number;
  isMobile: boolean;
  onTogglePlayPause: () => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onTimelineChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function VideoPlayerControls({
  isPlaying,
  showControls,
  isMuted,
  currentTime,
  duration,
  isMobile,
  onTogglePlayPause,
  onToggleMute,
  onToggleFullscreen,
  onTimelineChange,
}: VideoPlayerControlsProps) {
  return (
    <div
      className={cn(
        'absolute inset-0 transition-opacity duration-300 pointer-events-none',
        showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
      )}
    >
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Button
            variant="secondary"
            size="lg"
            onClick={(event) => {
              event.stopPropagation();
              onTogglePlayPause();
            }}
            className="bg-black/70 hover:bg-black/90 text-white h-16 w-16 rounded-full p-0 shadow-wes border border-white/20 pointer-events-auto"
          >
            <Play className="h-8 w-8 ml-1" fill="currentColor" />
          </Button>
        </div>
      )}

      <div
        className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-4 rounded-b-lg pointer-events-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-x-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onTogglePlayPause}
            className="text-white hover:bg-white/20 h-8 w-8 p-0"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" fill="currentColor" />
            ) : (
              <Play className="h-4 w-4 ml-0.5" fill="currentColor" />
            )}
          </Button>

          <span className="text-white text-xs font-mono min-w-[40px]">
            {formatTime(currentTime)}
          </span>

          <div className="flex-1 mx-2">
            <input
              type="range"
              min="0"
              max="100"
              value={duration ? (currentTime / duration) * 100 : 0}
              onChange={onTimelineChange}
              className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer styled-video-range"
            />
          </div>

          <span className="text-white text-xs font-mono min-w-[40px]">
            {formatTime(duration)}
          </span>

          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleMute}
            className="text-white hover:bg-white/20 h-8 w-8 p-0"
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>

          {!isMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleFullscreen}
              className="text-white hover:bg-white/20 h-8 w-8 p-0"
            >
              <Maximize className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
