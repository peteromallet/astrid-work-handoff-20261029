import {useEffect} from 'react';
import {useCurrentFrame} from 'remotion';

type DelayWindow = Window & {
  remotion_delayRenderTimeouts?: Record<string, {label: string | null; startTime: number}>;
  remotion_renderReady?: boolean;
};

/** Read-only probes for one requested frame. Enabled only by the frame bench. */
export const FrameDiagnostics = () => {
  const frame = useCurrentFrame();
  useEffect(() => {
    const started = performance.now();
    let samples = 0;
    const sample = () => {
      const now = performance.now();
      const scope = window as DelayWindow;
      const handles = Object.values(scope.remotion_delayRenderTimeouts ?? {}).map(({label, startTime}) => ({
        label, ageMs: Date.now() - startTime,
      }));
      const images = Array.from(document.images).filter((image) => !image.complete).map((image) => image.currentSrc || image.src);
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const slow = resources.filter((entry) => entry.duration > 100).sort((a, b) => b.duration - a.duration).slice(0, 8)
        .map((entry) => ({name: entry.name, ms: Math.round(entry.duration), bytes: entry.transferSize}));
      console.log(`ASTRID_FRAME_DIAG ${JSON.stringify({
        frame, sinceMountMs: Math.round(now - started), pageMs: Math.round(now), ready: scope.remotion_renderReady,
        fonts: document.fonts.status, handles, pendingImages: images.slice(0, 8),
        videoCount: document.querySelectorAll('video').length, audioCount: document.querySelectorAll('audio').length,
        resources: resources.length, slow,
      })}`);
      samples += 1;
      if (scope.remotion_renderReady || samples >= 60) clearInterval(timer);
    };
    const timer = setInterval(sample, 1000);
    sample();
    return () => clearInterval(timer);
  }, [frame]);
  return null;
};
