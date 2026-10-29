// @vitest-environment jsdom
import React, { createRef, useEffect } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { RemotionPreview } from './RemotionPreview';
import { useOptionalPreviewAudioFailureReporter } from '@/tools/video-editor/compositions/PreviewMediaFailureContext.tsx';
import type { ResolvedTimelineConfig } from '@/tools/video-editor/types';

const seenRetryGenerations = vi.hoisted(() => [] as number[]);

// The composition: an audio clip that has already given up and reports it.
vi.mock('@/tools/video-editor/compositions/TimelineRenderer', () => ({
  TimelineRenderer: function FailingAudio() {
    const reporter = useOptionalPreviewAudioFailureReporter();
    useEffect(() => {
      seenRetryGenerations.push(reporter?.retryGeneration ?? -1);
      if (reporter?.retryGeneration === 0) reporter.reportFailure({ clipId: 'vo-y09', source: '/v1/objects/sha256:55e8' });
    }, [reporter]);
    return null;
  },
}));

vi.mock('@remotion/player', async () => {
  const React = await import('react');
  return {
    Player: React.forwardRef(function Player(props: any, ref: any) {
      React.useImperativeHandle(ref, () => ({
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        getCurrentFrame: () => 0,
        isPlaying: () => false,
      }), []);
      const Composition = props.component;
      return <div data-testid="player"><Composition {...props.inputProps} /></div>;
    }),
  };
});

const config: ResolvedTimelineConfig = {
  output: { fps: 30, resolution: '1280x720', file: 'audio-failure.mp4' },
  tracks: [{ id: 'A1', kind: 'audio', label: 'A1' }],
  clips: [{ id: 'vo-y09', at: 0, track: 'A1', clipType: 'hold', hold: 3 }],
  registry: {},
} as ResolvedTimelineConfig;

it('shows audio that failed inside the composition in the editor chrome, outside the Player, and retries it', () => {
  render(<RemotionPreview config={config} onTimeUpdate={vi.fn()} playerContainerRef={createRef<HTMLDivElement>()} />);

  const notice = screen.getByTestId('preview-audio-failure');
  expect(notice).toHaveTextContent('Audio unavailable for 1 clip');
  expect(screen.getByTestId('player')).not.toContainElement(notice);

  act(() => {
    within(notice).getByRole('button', { name: 'Retry audio' }).click();
  });

  expect(screen.queryByTestId('preview-audio-failure')).toBeNull();
  expect(seenRetryGenerations).toEqual([0, 1]);
});
