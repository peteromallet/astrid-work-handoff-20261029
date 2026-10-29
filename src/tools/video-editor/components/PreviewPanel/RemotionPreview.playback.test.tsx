// @vitest-environment jsdom
import React, { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RemotionPreview } from '@/tools/video-editor/components/PreviewPanel/RemotionPreview.tsx';
import {
  getPreviewPlaybackPreferences,
  resetPreviewPlaybackPreferencesForTests,
  setPreviewPlaybackPreferences,
} from '@/tools/video-editor/components/PreviewPanel/previewPlaybackPreferences.ts';
import type { ResolvedTimelineConfig } from '@/tools/video-editor/types';

vi.mock('@/tools/video-editor/compositions/TimelineRenderer', () => ({
  TimelineRenderer: () => null,
}));

type PlayerPropsRecord = {
  initialVolume: number;
  initiallyMuted: boolean;
  playbackRate: number;
  inputProps: { config: ResolvedTimelineConfig; preparing: boolean; settling: boolean };
};

const playerListeners = new Map<string, Set<(...args: any[]) => void>>();
const playerPropsHistory: PlayerPropsRecord[] = [];
const playerHandles: Array<{
  seekTo: ReturnType<typeof vi.fn>;
  getCurrentFrame: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  toggle: ReturnType<typeof vi.fn>;
  isPlaying: ReturnType<typeof vi.fn>;
  setVolume: ReturnType<typeof vi.fn>;
  mute: ReturnType<typeof vi.fn>;
  unmute: ReturnType<typeof vi.fn>;
}> = [];

vi.mock('@remotion/player', async () => {
  const React = await import('react');

  return {
    Player: React.forwardRef(function MockPlayer(
      props: {
        component: React.ComponentType<{ config: ResolvedTimelineConfig; preparing: boolean; settling: boolean }>;
        inputProps: { config: ResolvedTimelineConfig; preparing: boolean; settling: boolean };
        initialVolume: number;
        initiallyMuted: boolean;
        playbackRate: number;
      },
      ref: React.Ref<unknown>,
    ) {
      playerPropsHistory.push({
        initialVolume: props.initialVolume,
        initiallyMuted: props.initiallyMuted,
        playbackRate: props.playbackRate,
        inputProps: props.inputProps,
      });
      React.useImperativeHandle(ref, () => {
        const seekTo = vi.fn();
        const getCurrentFrame = vi.fn(() => 0);
        const play = vi.fn();
        const pause = vi.fn();
        const toggle = vi.fn();
        const isPlaying = vi.fn(() => false);
        const setVolume = vi.fn();
        const mute = vi.fn();
        const unmute = vi.fn();
        const handle = { seekTo, getCurrentFrame, play, pause, toggle, isPlaying, setVolume, mute, unmute };
        playerHandles.push(handle);
        return {
          ...handle,
          addEventListener: (name: string, listener: (...args: unknown[]) => void) => {
            if (!playerListeners.has(name)) playerListeners.set(name, new Set());
            playerListeners.get(name)!.add(listener);
          },
          removeEventListener: (name: string, listener: (...args: unknown[]) => void) => {
            playerListeners.get(name)?.delete(listener);
          },
        };
      }, []);

      const Composition = props.component;
      return <div data-testid="mock-player"><Composition {...props.inputProps} /></div>;
    }),
  };
});

function emitPlayerEvent(name: string, detail: unknown = undefined) {
  for (const listener of playerListeners.get(name) ?? []) listener({ detail });
}

function makeConfig(label: string, hold = 1, fps = 30): ResolvedTimelineConfig {
  return {
    output: { fps, resolution: '1280x720', file: `${label}.mp4` },
    tracks: [{ id: 'V1', kind: 'visual', label: 'V1' }],
    clips: [{ id: `clip-${label}`, at: 0, track: 'V1', clipType: 'hold', hold }],
    registry: {},
  };
}

const overriddenProperties: Array<{ target: object; key: PropertyKey; descriptor: PropertyDescriptor | undefined }> = [];
function overrideProperty(target: object, key: PropertyKey, descriptor: PropertyDescriptor) {
  overriddenProperties.push({ target, key, descriptor: Object.getOwnPropertyDescriptor(target, key) });
  Object.defineProperty(target, key, { configurable: true, ...descriptor });
}

function renderPreview({
  config = makeConfig('playback'),
  transportOutlet,
  playerControls,
  compact,
  touchChrome,
}: {
  config?: ResolvedTimelineConfig;
  transportOutlet?: HTMLElement;
  playerControls?: boolean;
  compact?: boolean;
  touchChrome?: boolean;
} = {}) {
  const playerContainerRef = createRef<HTMLDivElement>();
  const view = render(
    <RemotionPreview
      config={config}
      onTimeUpdate={vi.fn()}
      playerContainerRef={playerContainerRef}
      transportOutlet={transportOutlet}
      playerControls={playerControls}
      compact={compact}
      touchChrome={touchChrome}
    />,
  );
  return { ...view, playerContainerRef, previewContainer: playerContainerRef.current! };
}

beforeEach(() => {
  window.localStorage.clear();
  resetPreviewPlaybackPreferencesForTests();
  playerListeners.clear();
  playerPropsHistory.length = 0;
  playerHandles.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const { target, key, descriptor } of overriddenProperties.splice(0).reverse()) {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  }
  window.localStorage.clear();
  resetPreviewPlaybackPreferencesForTests();
});

describe('RemotionPreview playback controls', () => {
  it('passes stored volume and mute into the Player initial props', () => {
    window.localStorage.setItem('astrid:previewPlayback', JSON.stringify({ volume: 0.4, muted: true }));
    resetPreviewPlaybackPreferencesForTests();

    renderPreview();

    expect(playerPropsHistory.at(-1)).toMatchObject({ initialVolume: 0.4, initiallyMuted: true });
  });

  it('updates the Player listening level without changing its timeline config', () => {
    const config = makeConfig('viewer-audio');
    config.tracks.push({ id: 'A1', kind: 'audio', label: 'A1', volume: 0.65 });
    config.clips.push({
      id: 'audio-level',
      at: 0,
      track: 'A1',
      clipType: 'media',
      asset: 'asset-audio-level',
      assetEntry: { src: '/audio-level.mp3', type: 'audio/mpeg' },
      from: 0,
      to: 1,
      volume: 0.4,
    });
    renderPreview({ config });
    const handle = playerHandles[0];
    const originalInputProps = playerPropsHistory.at(-1)!.inputProps;

    fireEvent.click(screen.getByRole('button', { name: 'Mute preview' }));
    expect(handle.mute).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Mute preview' }));
    expect(handle.unmute).toHaveBeenCalledTimes(1);

    act(() => setPreviewPlaybackPreferences({ volume: 0.3 }));

    expect(handle.setVolume).toHaveBeenCalledWith(0.3);
    expect(playerPropsHistory.at(-1)!.inputProps).toBe(originalInputProps);
    expect(playerPropsHistory.at(-1)!.inputProps.config).toBe(config);
    expect(config.tracks[1]?.volume).toBe(0.65);
    expect(config.clips[1]?.volume).toBe(0.4);
  });

  it('forwards playback speed to the Player without a loop control', () => {
    renderPreview();

    fireEvent.change(screen.getByRole('combobox', { name: 'Playback speed' }), { target: { value: '1.5' } });
    expect(playerPropsHistory.at(-1)!.playbackRate).toBe(1.5);
    expect(screen.queryByRole('button', { name: 'Loop playback' })).not.toBeInTheDocument();
  });

  it('does not show the output resolution in the transport', () => {
    renderPreview();

    expect(screen.getByRole('button', { name: 'Play' }).closest('[data-preview-transport]')).not.toHaveTextContent('1280x720');
  });

  it('keeps compact controls simple until entering fullscreen', () => {
    overrideProperty(document, 'fullscreenEnabled', { value: false });
    renderPreview({ compact: true });

    expect(screen.queryByRole('button', { name: 'Mute preview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Playback speed' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jump to beginning' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Full screen' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));

    expect(screen.getByRole('button', { name: 'Mute preview' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Playback speed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jump to beginning' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /full screen/i })).toBeInTheDocument();
  });

  it('shows the selected speed as text only when it differs from 1x', () => {
    renderPreview();
    const speedSelect = screen.getByRole('combobox', { name: 'Playback speed' });
    const speedControl = speedSelect.closest('label')!;

    expect(speedControl.querySelector('span')).toBeNull();
    act(() => setPreviewPlaybackPreferences({ rate: 1.5 }));

    expect(speedControl.querySelector('span')).toHaveTextContent('1.5×');
    act(() => setPreviewPlaybackPreferences({ rate: 1 }));
    expect(speedControl.querySelector('span')).toBeNull();
  });

  it('reveals mouse controls on hover and keeps touch controls visible', () => {
    const { unmount } = renderPreview();
    expect(screen.getByRole('button', { name: 'Play' })).not.toHaveClass('opacity-0');
    expect(screen.getByRole('button', { name: 'Jump to beginning' })).toHaveClass('opacity-0', 'group-hover/preview:opacity-100');
    unmount();

    renderPreview({ touchChrome: true });
    expect(screen.getByRole('button', { name: 'Play' })).not.toHaveClass('opacity-0');
    const jump = screen.getByRole('button', { name: 'Jump to beginning' });
    expect(jump).not.toHaveClass('opacity-0');
    expect(jump).not.toHaveClass('group-hover/preview:opacity-100');
  });

  it('keeps only jump and play controls when playerControls is false', () => {
    renderPreview({ playerControls: false });

    expect(screen.queryByRole('button', { name: 'Mute preview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Playback speed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Full screen' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jump to beginning' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('uses the window fullscreen fallback and exits it with Escape or F', () => {
    overrideProperty(document, 'fullscreenEnabled', { value: false });
    const { previewContainer } = renderPreview();

    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(previewContainer).toHaveAttribute('data-preview-fullscreen', 'window');
    expect(previewContainer.querySelector('input[type="range"][aria-label="Playback position"]')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(previewContainer).not.toHaveAttribute('data-preview-fullscreen');

    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    fireEvent.keyDown(window, { key: 'f' });
    expect(previewContainer).not.toHaveAttribute('data-preview-fullscreen');
  });

  it('tracks native fullscreenchange entry and exit', async () => {
    overrideProperty(document, 'fullscreenEnabled', { value: true });
    let fullscreenElement: Element | null = null;
    overrideProperty(document, 'fullscreenElement', { get: () => fullscreenElement });
    const requestFullscreen = vi.fn(() => Promise.resolve());
    overrideProperty(HTMLElement.prototype, 'requestFullscreen', { writable: true, value: requestFullscreen });
    const { previewContainer } = renderPreview();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
      await Promise.resolve();
    });
    expect(requestFullscreen).toHaveBeenCalled();

    fullscreenElement = previewContainer;
    act(() => document.dispatchEvent(new Event('fullscreenchange')));
    expect(previewContainer).toHaveAttribute('data-preview-fullscreen', 'native');

    fullscreenElement = null;
    act(() => document.dispatchEvent(new Event('fullscreenchange')));
    expect(previewContainer).not.toHaveAttribute('data-preview-fullscreen');
  });

  it('asks the browser to exit native fullscreen when Escape is pressed', async () => {
    overrideProperty(document, 'fullscreenEnabled', { value: true });
    let fullscreenElement: Element | null = null;
    overrideProperty(document, 'fullscreenElement', { get: () => fullscreenElement });
    const requestFullscreen = vi.fn(() => Promise.resolve());
    const exitFullscreen = vi.fn(() => Promise.resolve());
    overrideProperty(HTMLElement.prototype, 'requestFullscreen', { writable: true, value: requestFullscreen });
    overrideProperty(document, 'exitFullscreen', { writable: true, value: exitFullscreen });
    const { previewContainer } = renderPreview();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
      await Promise.resolve();
    });
    fullscreenElement = previewContainer;
    act(() => document.dispatchEvent(new Event('fullscreenchange')));
    expect(previewContainer).toHaveAttribute('data-preview-fullscreen', 'native');

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('keeps focus on the preview container after Escape exits window fullscreen', () => {
    overrideProperty(document, 'fullscreenEnabled', { value: false });
    const { previewContainer } = renderPreview();

    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(previewContainer).toHaveAttribute('data-preview-fullscreen', 'window');
    expect(document.activeElement).toBe(previewContainer);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(previewContainer).not.toHaveAttribute('data-preview-fullscreen');
    expect(document.activeElement).toBe(previewContainer);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('handles fullscreen playback, mute, and volume keyboard controls', () => {
    window.localStorage.setItem('astrid:previewPlayback', JSON.stringify({ volume: 0.5, muted: false }));
    resetPreviewPlaybackPreferencesForTests();
    overrideProperty(document, 'fullscreenEnabled', { value: false });
    renderPreview();
    const handle = playerHandles[0];

    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    fireEvent.keyDown(window, { key: ' ' });
    expect(handle.toggle).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'm' });
    expect(handle.mute).toHaveBeenCalledTimes(1);
    expect(getPreviewPlaybackPreferences().muted).toBe(true);

    act(() => setPreviewPlaybackPreferences({ volume: 0.5, muted: false }));
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(handle.setVolume.mock.lastCall?.[0]).toBeCloseTo(0.55);
  });

  it('hides fullscreen controls only while playing and wakes them on mouse movement', async () => {
    vi.useFakeTimers();
    overrideProperty(document, 'fullscreenEnabled', { value: false });
    const { previewContainer } = renderPreview();
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    const transport = previewContainer.querySelector('[data-preview-transport]')!;
    transport.querySelector('button')?.blur();
    // jsdom reports :hover for the transport even after a synthetic pointer move onto the
    // picture, so model the pointer being outside the controls for the idle timer assertion.
    vi.spyOn(transport, 'matches').mockImplementation((selector) => (
      selector === ':hover, :focus-within' ? false : Element.prototype.matches.call(transport, selector)
    ));
    // Put the pointer over the picture, away from the controls, before testing idle fade.
    fireEvent.pointerMove(previewContainer, { pointerType: 'mouse' });

    await act(async () => { await vi.advanceTimersByTimeAsync(2600); });
    expect(transport).not.toHaveClass('invisible');

    act(() => emitPlayerEvent('play'));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(2600); });
    expect(transport).toHaveClass('invisible');

    fireEvent.pointerMove(previewContainer, { pointerType: 'mouse' });
    expect(transport).not.toHaveClass('invisible');
  });

  it('moves an outlet transport into the preview container while fullscreen', () => {
    overrideProperty(document, 'fullscreenEnabled', { value: false });
    const outlet = document.createElement('div');
    document.body.append(outlet);
    const { container, previewContainer, unmount } = renderPreview({ transportOutlet: outlet });

    expect(outlet.querySelector('[data-preview-transport]')).toBeInTheDocument();
    expect(container.querySelector('[data-preview-transport]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(previewContainer.querySelector('[data-preview-transport]')).toBeInTheDocument();
    expect(outlet.querySelector('[data-preview-transport]')).toBeNull();

    unmount();
    outlet.remove();
  });
});
