import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MediaDisplayWithCanvas } from './MediaDisplayWithCanvas';

vi.mock('@/shared/components/media/StyledVideoPlayer', () => ({
  StyledVideoPlayer: ({
    src,
    style,
  }: {
    src: string;
    style?: React.CSSProperties;
  }) => <video data-testid="styled-video-player" src={src} style={style} />,
}));

describe('MediaDisplayWithCanvas desktop side panel sizing', () => {
  it('constrains images to the allocated media container height', () => {
    render(
      <MediaDisplayWithCanvas
        effectiveImageUrl="https://example.test/image.png"
        isVideo={false}
        variant="desktop-side-panel"
      />,
    );

    expect(screen.getByRole('img', { name: 'Media content' }).style.maxHeight).toBe('100%');
  });

  it('constrains videos to the allocated media container height', () => {
    render(
      <MediaDisplayWithCanvas
        effectiveImageUrl="https://example.test/video.mp4"
        isVideo
        variant="desktop-side-panel"
      />,
    );

    expect(screen.getByTestId('styled-video-player').style.maxHeight).toBe('100%');
  });
});
