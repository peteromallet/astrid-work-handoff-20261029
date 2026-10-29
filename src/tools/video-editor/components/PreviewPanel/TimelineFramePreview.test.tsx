// @vitest-environment jsdom
import React, { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedTimelineConfig } from '@/tools/video-editor/types';
import { TimelineFramePreview, framePreviewPlacement, framePreviewSize, usePanelFramePreview } from './TimelineFramePreview';

const mocks = vi.hoisted(() => ({
  renders: [] as Array<{ component: unknown; frameToDisplay: number; config: ResolvedTimelineConfig }>,
  mounted: 0,
  renderer: vi.fn(() => null),
  admission: Object.freeze({ id: 'admission' }),
  readiness: Object.freeze({ id: 'readiness' }),
}));

vi.mock('@remotion/player', async () => {
  const React = await import('react');
  return {
    Thumbnail: (props: { component: React.ComponentType<any>; frameToDisplay: number; inputProps: { config: ResolvedTimelineConfig } }) => {
      React.useEffect(() => { mocks.mounted += 1; return () => { mocks.mounted -= 1; }; }, []);
      mocks.renders.push({ component: props.component, frameToDisplay: props.frameToDisplay, config: props.inputProps.config });
      const clipIds = props.inputProps.config.clips.map((clip) => clip.id).join(',');
      return <div data-testid="thumbnail"><div className="mock-composition-frame" data-frame={props.frameToDisplay}>{clipIds}</div></div>;
    },
  };
});

vi.mock('../../compositions/TimelineRenderer.tsx', () => ({ TimelineRenderer: mocks.renderer }));
vi.mock('../../contexts/VideoEditorRuntimeContext.tsx', () => ({ useOptionalVideoEditorRuntime: () => null }));
vi.mock('../../runtime/admitted-elements.ts', () => ({
  subscribeAdmittedElements: () => () => undefined,
  getAdmittedElementSelection: () => mocks.admission,
  subscribeAdmittedElementReadiness: () => () => undefined,
  getAdmittedElementReadiness: () => mocks.readiness,
}));

function makeConfig(label: string): ResolvedTimelineConfig {
  return {
    output: { fps: 10, resolution: '320x180', file: `${label}.mp4` },
    tracks: [
      { id: 'V1', kind: 'visual', label: 'Output', role: 'output' },
      { id: 'S1', kind: 'visual', label: 'Source', role: 'source' },
    ],
    clips: [
      { id: `output-${label}`, at: 0, track: 'V1', clipType: 'hold', hold: 4 },
      { id: `source-${label}`, at: 0, track: 'S1', clipType: 'hold', hold: 4 },
    ],
    registry: {},
  };
}

const anchor = { left: 100, top: 300, width: 40, height: 20 };

beforeEach(() => {
  mocks.renders.length = 0;
  mocks.mounted = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('TimelineFramePreview', () => {
  it('delivers the composed output frame to one Thumbnail and excludes source clips', async () => {
    const config = makeConfig('first');
    const { rerender } = render(<TimelineFramePreview config={config} request={{ seconds: 1.26, anchor }} />);
    await waitFor(() => expect(mocks.renders.length).toBeGreaterThan(0));
    expect(mocks.renders.at(-1)?.component).toBe(mocks.renderer);
    expect(mocks.renders.at(-1)?.frameToDisplay).toBe(13);
    expect(mocks.renders.at(-1)?.config.clips.map((clip) => clip.id)).toEqual(['output-first']);
    expect(mocks.mounted).toBe(1);
    rerender(<TimelineFramePreview config={config} request={{ seconds: 2, anchor }} />);
    await waitFor(() => expect(mocks.renders.at(-1)?.frameToDisplay).toBe(20));
    rerender(<TimelineFramePreview config={config} request={null} />);
    expect(mocks.mounted).toBe(1);
  });

  it('shows a cached frozen frame without changing the live Thumbnail delivery', async () => {
    const config = makeConfig('cache');
    const view = render(<TimelineFramePreview config={config} request={{ seconds: 0, anchor }} />);
    const card = await screen.findByLabelText('Film frame preview');
    await waitFor(() => expect(within(card).getByTestId('thumbnail')).toBeTruthy());
    const frozenFrame = () => card.querySelector('.transcript-frame-preview > div:first-child [data-testid="thumbnail"] > .mock-composition-frame');
    await waitFor(() => expect(frozenFrame()?.getAttribute('data-frame')).toBe('0'));
    expect(card.querySelector('[data-testid="frame-preview-loading"]')).toBeNull();
    expect(card).toHaveTextContent('0:00.00');

    view.rerender(<TimelineFramePreview config={config} request={{ seconds: 2, anchor }} />);
    expect(card.querySelector('[data-testid="frame-preview-loading"]')).not.toBeNull();
    expect(card).toHaveTextContent('0:02.00');
    await waitFor(() => expect(mocks.renders.at(-1)?.frameToDisplay).toBe(20));
    await waitFor(() => expect(frozenFrame()?.getAttribute('data-frame')).toBe('20'));
    view.rerender(<TimelineFramePreview config={config} request={{ seconds: 0, anchor }} />);
    await waitFor(() => expect(frozenFrame()?.getAttribute('data-frame')).toBe('0'));
    expect(mocks.renders.at(-1)?.frameToDisplay).toBe(20);
    expect(mocks.mounted).toBe(1);
  });

  it('invalidates frozen frames and delivers the new revision', async () => {
    const view = render(<TimelineFramePreview config={makeConfig('old')} request={{ seconds: 1, anchor }} />);
    const card = await screen.findByLabelText('Film frame preview');
    await waitFor(() => expect(card.querySelector('.mock-composition-frame')?.textContent).toBe('output-old'));
    view.rerender(<TimelineFramePreview config={makeConfig('new')} request={{ seconds: 1, anchor }} />);
    await waitFor(() => expect(mocks.renders.at(-1)?.config.clips[0].id).toBe('output-new'));
    await waitFor(() => expect(card.querySelector('.mock-composition-frame')?.textContent).toBe('output-new'));
  });

  it('shows nothing, and never throws, when the output has no usable resolution', () => {
    const config = makeConfig('sizeless');
    const sizeless = { ...config, output: { fps: 10, file: 'sizeless.mp4' } } as unknown as ResolvedTimelineConfig;
    const { container } = render(<TimelineFramePreview config={sizeless} request={{ seconds: 1, anchor }} />);
    expect(container.ownerDocument.querySelector('[aria-label="Film frame preview"]')).toBeNull();
    expect(mocks.mounted).toBe(0);
    render(<TimelineFramePreview config={{ ...config, output: { ...config.output, resolution: 'auto' } }} request={{ seconds: 1, anchor }} />);
    expect(mocks.mounted).toBe(0);
  });

  it('keeps a newer hover when an older disposer runs and hides on scroll or resize', () => {
    let service: ReturnType<typeof usePanelFramePreview>['preview'];
    let currentRequest: ReturnType<typeof usePanelFramePreview>['request'];
    function Harness() {
      const state = usePanelFramePreview();
      service = state.preview;
      currentRequest = state.request;
      return <TimelineFramePreview config={makeConfig('hook')} request={state.request} />;
    }
    render(<Harness />);
    let old!: { dispose: () => void };
    act(() => {
      old = service.showFrame({ seconds: 0, anchor });
      service.showFrame({ seconds: 1, anchor });
      old.dispose();
    });
    expect(currentRequest?.seconds).toBe(1);
    const card = screen.getByLabelText('Film frame preview');
    expect(card).toHaveAttribute('aria-hidden', 'false');
    act(() => fireEvent.scroll(window));
    expect(card).toHaveAttribute('aria-hidden', 'true');
    act(() => service.showFrame({ seconds: 1, anchor }));
    expect(card).toHaveAttribute('aria-hidden', 'false');
    act(() => fireEvent.resize(window));
    expect(card).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('usePanelFramePreview', () => {
  afterEach(() => vi.useRealTimers());

  it('lingers briefly after leave so moving to the next word never blinks', () => {
    vi.useFakeTimers();
    let service!: ReturnType<typeof usePanelFramePreview>['preview'];
    let currentRequest: ReturnType<typeof usePanelFramePreview>['request'];
    function Harness() {
      const state = usePanelFramePreview();
      service = state.preview;
      currentRequest = state.request;
      return null;
    }
    render(<Harness />);
    let first!: { dispose: () => void };
    act(() => { first = service.showFrame({ seconds: 0, anchor }); });
    act(() => { first.dispose(); vi.advanceTimersByTime(200); });
    expect(currentRequest?.seconds).toBe(0);
    let second!: { dispose: () => void };
    act(() => { second = service.showFrame({ seconds: 1, anchor }); vi.advanceTimersByTime(500); });
    expect(currentRequest?.seconds).toBe(1);
    act(() => { second.dispose(); vi.advanceTimersByTime(250); });
    expect(currentRequest).toBeNull();
  });
});

describe('framePreviewPlacement', () => {
  it('centers and clamps the card above its anchor, then flips below when space is tight', () => {
    const above = framePreviewPlacement({ left: 140, top: 250, width: 40, height: 20 }, 16 / 9, 320, 600);
    expect(above.top).toBeLessThan(250);
    expect(above.left).toBeGreaterThanOrEqual(8);
    expect(above.left + above.width).toBeLessThanOrEqual(312);
    expect(above.left + above.width / 2).toBeCloseTo(160);
    const clamped = framePreviewPlacement({ left: 0, top: 250, width: 40, height: 20 }, 16 / 9, 320, 600);
    expect(clamped.left).toBe(8);

    const below = framePreviewPlacement({ left: 260, top: 10, width: 40, height: 20 }, 16 / 9, 320, 260);
    expect(below.side).toBe('bottom');
    expect(below.top).toBeGreaterThanOrEqual(38);
    expect(below.left + below.width).toBeLessThanOrEqual(312);
  });

  it('shows whole-pixel 16:9 frames and points at the word when the card is clamped', () => {
    expect(framePreviewSize(16 / 9)).toEqual({ width: 256, height: 144 });
    expect(framePreviewSize(9 / 16)).toEqual({ width: 99, height: 176 });
    const placement = framePreviewPlacement({ left: 930, top: 400, width: 60, height: 20 }, 16 / 9, 1328, 730, { left: 897, right: 1315 });
    expect(placement).toMatchObject({ side: 'top', frameWidth: 256, frameHeight: 144, width: 264, height: 152, left: 905 });
    expect(placement.left + placement.pointer).toBe(960);
    expect(placement.top + placement.height).toBe(391);
  });
});
