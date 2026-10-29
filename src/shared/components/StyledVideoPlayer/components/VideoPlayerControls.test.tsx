import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VideoPlayerControls } from './VideoPlayerControls';

const { mockFormatTime } = vi.hoisted(() => ({
  mockFormatTime: vi.fn((value: number) => `${value.toFixed(1)}s`),
}));

vi.mock('@/shared/lib/timeFormatting', () => ({
  formatTime: mockFormatTime,
}));

describe('VideoPlayerControls', () => {
  it('wires desktop controls to callback props', () => {
    const onTogglePlayPause = vi.fn();
    const onToggleMute = vi.fn();
    const onToggleFullscreen = vi.fn();
    const onTimelineChange = vi.fn();

    render(
      <VideoPlayerControls
        isPlaying
        showControls
        isMuted={false}
        currentTime={10}
        duration={40}
        isMobile={false}
        onTogglePlayPause={onTogglePlayPause}
        onToggleMute={onToggleMute}
        onToggleFullscreen={onToggleFullscreen}
        onTimelineChange={onTimelineChange}
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);

    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    fireEvent.click(buttons[2]);

    expect(onTogglePlayPause).toHaveBeenCalledTimes(1);
    expect(onToggleMute).toHaveBeenCalledTimes(1);
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '50' } });
    expect(onTimelineChange).toHaveBeenCalledTimes(1);

    expect(screen.getByText('10.0s')).toBeInTheDocument();
    expect(screen.getByText('40.0s')).toBeInTheDocument();
  });

  it('shows center play overlay button when paused', () => {
    const onTogglePlayPause = vi.fn();

    render(
      <VideoPlayerControls
        isPlaying={false}
        showControls={false}
        isMuted={false}
        currentTime={0}
        duration={12}
        isMobile={false}
        onTogglePlayPause={onTogglePlayPause}
        onToggleMute={vi.fn()}
        onToggleFullscreen={vi.fn()}
        onTimelineChange={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);

    fireEvent.click(buttons[0]);
    expect(onTogglePlayPause).toHaveBeenCalledTimes(1);
  });

  it('hides fullscreen control on mobile', () => {
    render(
      <VideoPlayerControls
        isPlaying
        showControls
        isMuted
        currentTime={3}
        duration={8}
        isMobile
        onTogglePlayPause={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleFullscreen={vi.fn()}
        onTimelineChange={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
