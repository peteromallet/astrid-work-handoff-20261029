import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TourMedia } from './TourMedia';

const slot = { url: '/video.mp4', width: 1344, height: 768, previewDurationSeconds: 14 };
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('tour video position', () => {
  it('keeps the still visible until a video frame arrives and restores it on failure', () => {
    const view = render(<TourMedia kind="video" slot={slot} playing poster="/still.png" />);
    const video = view.container.querySelector('video')!;
    expect(view.container.querySelector('img')).toHaveAttribute('src', '/still.png');
    expect(video).toHaveStyle({ opacity: '0' });
    fireEvent.loadedData(video);
    expect(view.container.querySelector('img')).toBeNull();
    expect(video.style.opacity).toBe('');
    fireEvent.error(video);
    expect(view.container.querySelector('img')).toHaveAttribute('src', '/still.png');
  });

  it('pauses at the preview end and holds it without looping or restarting', () => {
    const view = render(<TourMedia kind="video" slot={slot} playing />);
    const video = view.container.querySelector('video')!;
    expect(video.loop).toBe(false);
    video.currentTime = 14.1;
    fireEvent.timeUpdate(video);
    expect(video.pause).toHaveBeenCalled();
    expect(video.currentTime).toBe(14);
    view.rerender(<TourMedia kind="video" slot={slot} playing={false} />);
    view.rerender(<TourMedia kind="video" slot={slot} playing />);
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(video.currentTime).toBe(14);
  });

  it('holds the current position when stopped and resumes there', () => {
    const view = render(<TourMedia kind="video" slot={slot} playing />);
    const video = view.container.querySelector('video')!;
    video.currentTime = 7.25;
    view.rerender(<TourMedia kind="video" slot={slot} playing={false} />);
    expect(video.pause).toHaveBeenCalled();
    expect(video.currentTime).toBe(7.25);
    view.rerender(<TourMedia kind="video" slot={slot} playing />);
    expect(video.play).toHaveBeenCalledTimes(2);
    expect(video.currentTime).toBe(7.25);
  });
});
