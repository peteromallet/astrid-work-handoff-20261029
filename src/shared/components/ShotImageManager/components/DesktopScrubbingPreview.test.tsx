import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesktopScrubbingPreview } from './DesktopScrubbingPreview';

vi.mock('@/shared/lib/media/mediaUrl', () => ({
  getDisplayUrl: (url: string) => `display:${url}`,
}));

describe('DesktopScrubbingPreview', () => {
  it('returns null when no active scrub target exists', () => {
    const { container } = render(
      <DesktopScrubbingPreview
        activeScrubbingIndex={null}
        activeSegmentSlot={null}
        activeSegmentVideoUrl={null}
        clampedPreviewX={100}
        previewY={200}
        previewDimensions={{ width: 300, height: 180 }}
        previewVideoRef={{ current: null }}
        scrubbing={{
          scrubberPosition: null,
          scrubberVisible: false,
          duration: 0,
          currentTime: 0,
          videoProps: {},
        } as never}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders portal preview with segment label and scrubber progress', () => {
    render(
      <DesktopScrubbingPreview
        activeScrubbingIndex={1}
        activeSegmentSlot={{ type: 'child', index: 1 } as never}
        activeSegmentVideoUrl={'https://example.com/segment.mp4'}
        clampedPreviewX={220}
        previewY={320}
        previewDimensions={{ width: 280, height: 160 }}
        previewVideoRef={{ current: null }}
        scrubbing={{
          scrubberPosition: 50,
          scrubberVisible: true,
          duration: 12.3,
          currentTime: 3.4,
          videoProps: { onMouseMove: vi.fn() },
        } as never}
      />,
    );

    expect(screen.getByText('Segment 2')).toBeInTheDocument();
    expect(screen.getByText('3.4s / 12.3s')).toBeInTheDocument();
    const video = document.body.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video?.getAttribute('src')).toBe('display:https://example.com/segment.mp4');
    const progress = document.body.querySelector('.h-full.bg-primary') as HTMLElement | null;
    expect(progress?.style.width).toBe('50%');
  });
});
