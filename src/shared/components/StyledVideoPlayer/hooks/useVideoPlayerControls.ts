import { useCallback } from 'react';

interface UseVideoPlayerControlsParams {
  videoRef: React.RefObject<HTMLVideoElement>;
  isMobile: boolean;
  duration: number;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setIsMuted: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentTime: React.Dispatch<React.SetStateAction<number>>;
}

interface UseVideoPlayerControlsResult {
  togglePlayPause: () => void;
  toggleMute: () => void;
  handleTimelineChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  toggleFullscreen: () => void;
  handleContainerClick: (event: React.MouseEvent) => void;
}

export function useVideoPlayerControls({
  videoRef,
  isMobile,
  duration,
  setIsPlaying,
  setIsMuted,
  setCurrentTime,
}: UseVideoPlayerControlsParams): UseVideoPlayerControlsResult {
  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [videoRef, setIsPlaying]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, [videoRef, setIsMuted]);

  const handleTimelineChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const video = videoRef.current;
      if (!video) {
        return;
      }

      const newTime = (parseFloat(event.target.value) / 100) * duration;
      video.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [videoRef, duration, setCurrentTime]
  );

  const toggleFullscreen = useCallback(() => {
    if (isMobile) {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      video.requestFullscreen();
    }
  }, [videoRef, isMobile]);

  const handleContainerClick = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'VIDEO' || target === event.currentTarget) {
        event.stopPropagation();
        togglePlayPause();
      }
    },
    [togglePlayPause]
  );

  return {
    togglePlayPause,
    toggleMute,
    handleTimelineChange,
    toggleFullscreen,
    handleContainerClick,
  };
}
