// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionContext, PanelPreviewService, PanelVideoAdapter, TranscriptPanelAdapter, TranscriptPanelSnapshot, TranscriptSourceRow } from '@astrid/editor-sdk';
import { TranscriptPanel } from '@astrid/packs/rendering/ui/transcript/TranscriptPanel';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const source: TranscriptSourceRow = {
  sourceItemId: 'line',
  sourceId: 'default',
  assetId: 'media',
  start: 0,
  end: 2,
  text: 'Hello world.',
  words: [
    { id: 'hello', text: 'Hello', start: 0.2, end: 0.7 },
    { id: 'world', text: 'world', start: 1, end: 1.5 },
  ],
};

function occurrence(id: string, clipId: string, offset: number, firstTiming: 'word' | 'outside' | 'unusable' = 'word', secondTiming: 'word' | 'outside' | 'unusable' = 'word') {
  return {
    id,
    sourceItemId: source.sourceItemId,
    sourceId: source.sourceId,
    assetId: source.assetId,
    clipId,
    timelineStart: offset,
    timelineEnd: offset + 2,
    words: [
      { ...source.words![0], timing: firstTiming, timelineStart: firstTiming === 'word' ? offset + 0.2 : null, timelineEnd: firstTiming === 'word' ? offset + 0.7 : null },
      { ...source.words![1], timing: secondTiming, timelineStart: secondTiming === 'word' ? offset + 1 : null, timelineEnd: secondTiming === 'word' ? offset + 1.5 : null },
    ],
  };
}

function setup(occurrences = [occurrence('first', 'clip-1', 2)]) {
  vi.useFakeTimers();
  const snapshot: TranscriptPanelSnapshot = { sources: [source], occurrences };
  const adapter = {
    getSnapshot: () => snapshot,
    subscribe: () => ({ dispose: vi.fn() }),
    getMediaChoices: () => [{ assetId: 'media', label: 'Interview.mp4', kind: 'video' as const }],
    getPlayback: () => ({ playing: [], focused: null, assetId: null, sourceId: null, playingWordIds: [] }),
    selectSource: (_selection: unknown, selected: unknown) => selected,
    seek: () => ({ ok: false as const, reason: 'unavailable' as const }),
  } as unknown as TranscriptPanelAdapter;
  const dispose = vi.fn();
  const showFrame = vi.fn<PanelPreviewService['showFrame']>(() => ({ dispose }));
  const video = {
    transcript: adapter,
    preview: { showFrame } satisfies PanelPreviewService,
    seek: vi.fn(),
    view: {
      subscribe: () => ({ dispose: vi.fn() }),
      getSnapshot: () => ({ playhead: { time: 0, isPlaying: false } }),
    },
  } satisfies PanelVideoAdapter;
  const panel = (visible = true) => createElement(TranscriptPanel, {
    context: {} as ExtensionContext,
    instanceId: 'editor:transcript',
    visible,
    video,
  });
  const view = render(panel());
  return { ...view, panel, showFrame, dispose };
}

function hover(view: ReturnType<typeof setup>, word: Element) {
  fireEvent.mouseEnter(word);
  act(() => { vi.advanceTimersByTime(150); });
}

describe('TranscriptPanel word frame preview', () => {
  it('waits 150ms and cancels a pending preview while sweeping across words', () => {
    const view = setup();
    const words = view.getByRole('group', { name: 'Transcript text' }).querySelectorAll('[data-word-id]');
    fireEvent.mouseEnter(words[0]);
    act(() => { vi.advanceTimersByTime(149); });
    expect(view.showFrame).not.toHaveBeenCalled();

    fireEvent.mouseLeave(words[0]);
    fireEvent.mouseEnter(words[1]);
    act(() => { vi.advanceTimersByTime(149); });
    expect(view.showFrame).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(view.showFrame).toHaveBeenCalledOnce();
    expect(view.showFrame.mock.calls[0][0].seconds).toBe(3);
  });

  it('anchors the delayed preview to the word and disposes it on leave', () => {
    const view = setup();
    const word = view.getByText('Hello');
    vi.spyOn(word, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 30, height: 12 } as DOMRect);

    hover(view, word);

    expect(view.showFrame).toHaveBeenCalledWith({
      seconds: 2.2,
      anchor: { left: 10, top: 20, width: 30, height: 12 },
    });
    fireEvent.mouseLeave(word);
    expect(view.dispose).toHaveBeenCalledOnce();
  });

  it('does not preview words outside the occurrence or with unusable timing', () => {
    const view = setup([occurrence('first', 'clip-1', 2, 'outside', 'unusable')]);
    const words = view.getByRole('group', { name: 'Transcript text' }).querySelectorAll('[data-word-id]');
    expect([...words].some((word) => word.getAttribute('data-word-id') === 'hello')).toBe(false);
    const unusable = view.getByText('world');
    fireEvent.mouseEnter(unusable);
    act(() => { vi.advanceTimersByTime(300); });
    expect(view.showFrame).not.toHaveBeenCalled();
  });

  it('uses the repeated occurrence timeline projection for the hovered word', () => {
    const view = setup([
      occurrence('first', 'clip-1', 2),
      occurrence('repeat', 'clip-2', 12),
    ]);
    const helloWords = view.getAllByText('Hello');

    hover(view, helloWords[1]);

    expect(view.showFrame).toHaveBeenCalledWith(expect.objectContaining({ seconds: 12.2 }));
  });

  it('disposes the preview when the panel is hidden, scrolled, or unmounted', () => {
    const hidden = setup();
    hover(hidden, hidden.container.querySelector('[data-word-id="hello"]')!);
    hidden.rerender(hidden.panel(false));
    expect(hidden.dispose).toHaveBeenCalledOnce();

    const scrolled = setup();
    hover(scrolled, scrolled.container.querySelector('[data-word-id="hello"]')!);
    fireEvent.scroll(scrolled.container.querySelector('[data-testid="transcript-reading-area"]')!);
    expect(scrolled.dispose).toHaveBeenCalledOnce();

    const unmounted = setup();
    hover(unmounted, unmounted.container.querySelector('[data-word-id="hello"]')!);
    unmounted.unmount();
    expect(unmounted.dispose).toHaveBeenCalledOnce();
  });
});
