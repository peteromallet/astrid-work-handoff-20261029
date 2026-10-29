import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setRuntimeOrigin } from '@/integrations/runtime/connection';
import { HoverScrubVideo } from '../media/HoverScrubVideo';

vi.mock('@/shared/hooks/mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/shared/hooks/useVideoScrubbing', () => ({
  useVideoScrubbing: () => ({
    containerRef: { current: null },
    containerProps: {},
    videoRef: { current: null },
    videoProps: {},
    progress: 0, currentTime: 0, duration: 0, scrubberPosition: null, scrubberVisible: false, isHovering: false, isPlaying: false,
    setVideoElement: vi.fn(), setDuration: vi.fn(), seekToProgress: vi.fn(), play: vi.fn(), pause: vi.fn(), reset: vi.fn(),
  }),
}));

// The Runtime origin is set once per page; this file is the hosted build.
const GATEWAY = 'http://127.0.0.1:17340';
setRuntimeOrigin({ VITE_RUNTIME_ORIGIN: GATEWAY });

// A <video poster> is fetched in the video's own CORS mode, so a gateway poster only carries Origin when the video says so.
describe('HoverScrubVideo with gateway media', () => {
  it('asks for CORS when only the poster is a gateway URL, even before the video has a src', () => {
    const poster = `${GATEWAY}/api/runtime/v1/objects/p`;
    const video = render(<HoverScrubVideo src="" poster={poster} />).container.querySelector('video');
    expect(video?.getAttribute('crossorigin')).toBe('anonymous');
    expect(video?.getAttribute('poster')).toBe(poster);
  });

  it('asks for CORS for a gateway video, and leaves other media without the attribute', () => {
    const gateway = render(<HoverScrubVideo src={`${GATEWAY}/api/runtime/v1/objects/v`} />);
    expect(gateway.container.querySelector('video')?.getAttribute('crossorigin')).toBe('anonymous');
    const other = render(<HoverScrubVideo src="https://example.com/video.mp4" poster="https://example.com/poster.jpg" />);
    expect(other.container.querySelector('video')?.hasAttribute('crossorigin')).toBe(false);
  });
});
