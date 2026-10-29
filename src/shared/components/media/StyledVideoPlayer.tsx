import React, { useRef } from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { getDisplayUrl } from '@/shared/lib/media/mediaUrl';
import { mediaCrossOrigin } from '@/shared/lib/media/mediaCrossOrigin';
import { useIsMobile } from '@/shared/hooks/mobile';
import { VideoPlayerControls } from '@/shared/components/StyledVideoPlayer/components/VideoPlayerControls';
import { useVideoPlayerControls } from '@/shared/components/StyledVideoPlayer/hooks/useVideoPlayerControls';
import { useVideoPlayerState } from '@/shared/components/StyledVideoPlayer/hooks/useVideoPlayerState';
interface StyledVideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  style?: React.CSSProperties;
  loop?: boolean;
  muted?: boolean;
  autoPlay?: boolean;
  playsInline?: boolean;
  preload?: 'auto' | 'metadata' | 'none';
  onLoadedMetadata?: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  playbackStart?: number;
  playbackEnd?: number;
  videoDimensions?: { width: number; height: number };
}

export const StyledVideoPlayer: React.FC<StyledVideoPlayerProps> = ({
  src,
  poster,
  className = '',
  style = {},
  loop = true,
  muted = true,
  autoPlay = true,
  playsInline = true,
  preload = 'auto',
  onLoadedMetadata,
  playbackStart,
  playbackEnd,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isMobile = useIsMobile();

  const {
    isPlaying,
    setIsPlaying,
    isMuted,
    setIsMuted,
    currentTime,
    setCurrentTime,
    duration,
    showControls,
    isVideoReady,
    setIsHovering,
  } = useVideoPlayerState({
    videoRef,
    src,
    poster,
    muted,
    playbackStart,
    playbackEnd,
  });

  const {
    togglePlayPause,
    toggleMute,
    handleTimelineChange,
    toggleFullscreen,
    handleContainerClick,
  } = useVideoPlayerControls({
    videoRef,
    isMobile,
    duration,
    setIsPlaying,
    setIsMuted,
    setCurrentTime,
  });

  const wrapperStyle: React.CSSProperties = {
    ...style,
  };

  return (
    <div
      className="flex items-center justify-center w-full h-full pointer-events-none"
      style={wrapperStyle}
    >
      <div
        className={cn('relative inline-flex max-w-full max-h-full pointer-events-auto', className)}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onClick={handleContainerClick}
      >
        <video
          ref={videoRef}
          src={src}
          // A poster is fetched with the video's CORS mode, so a gateway poster needs the attribute too.
          crossOrigin={mediaCrossOrigin(src) ?? mediaCrossOrigin(poster)}
          poster={poster}
          loop={loop}
          muted={isMuted}
          autoPlay={autoPlay}
          playsInline={playsInline}
          preload={preload}
          className="block max-w-full max-h-full object-contain rounded-lg bg-black cursor-pointer"
          onLoadedMetadata={onLoadedMetadata}
        >
          Your browser does not support the video tag.
        </video>

        {poster && !isVideoReady && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
            <img
              src={getDisplayUrl(poster)}
              crossOrigin={mediaCrossOrigin(getDisplayUrl(poster))}
              alt=""
              className="max-w-full max-h-full object-contain rounded-lg"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-black/60 rounded-full p-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              </div>
            </div>
          </div>
        )}

        {!poster && !isVideoReady && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/60 rounded-full p-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            </div>
          </div>
        )}

        <VideoPlayerControls
          isPlaying={isPlaying}
          showControls={showControls}
          isMuted={isMuted}
          currentTime={currentTime}
          duration={duration}
          isMobile={isMobile}
          onTogglePlayPause={togglePlayPause}
          onToggleMute={toggleMute}
          onToggleFullscreen={toggleFullscreen}
          onTimelineChange={handleTimelineChange}
        />
      </div>
    </div>
  );
};
