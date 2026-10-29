// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { SceneSurface } from '@astrid/packs/rendering/ui/threejs-live-editor/SceneSurface';
import { createTimelineStore, TimelineStoreProvider } from '@/tools/video-editor/hooks/timelineStore';
import { exitEditorTour, setEditorTourBeat, startEditorTour } from '@/shared/state/editorTourStore';
import { EDITOR_TOUR_TRACK_IDS } from '../anchors';
import { EditorTourTimelineDriver } from './EditorTourTimelineDriver';
import { loadTourLiveScene, TOUR_SCENE_SOURCE_FROM } from './tourSceneSource';

afterEach(() => { cleanup(); exitEditorTour(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('keeps the clock paused until the real visible world acknowledges its opening frame, even after a warm thumbnail and slow initialization', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (!path.startsWith('/astrid/onboarding/lantern-valley-14s-v1/')) throw new Error(`Unexpected request: ${path}`);
    return new Response(readFileSync(`public${path}`));
  });
  vi.stubGlobal('fetch', fetch);
  const source = await loadTourLiveScene(); // Actual shipped prepared world and integrity/import path.
  const endpoints = new Map<HTMLIFrameElement, { postMessage: ReturnType<typeof vi.fn> }>();
  vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockImplementation(function (this: HTMLIFrameElement) {
    if (!endpoints.has(this)) endpoints.set(this, { postMessage: vi.fn() });
    return endpoints.get(this)! as unknown as Window;
  });
  const messages = (iframe: HTMLIFrameElement): Record<string, unknown>[] => endpoints.get(iframe)!.postMessage.mock.calls.map(([message]) => message);
  const acknowledge = (iframe: HTMLIFrameElement, message: Record<string, unknown>) => act(() => {
    window.dispatchEvent(new MessageEvent('message', { source: endpoints.get(iframe)! as unknown as Window,
      data: { ...messages(iframe)[0], ...message } }));
  });
  const previewHandle = { pause: vi.fn(), seek: vi.fn(), play: vi.fn() };
  const store = createTimelineStore();
  store.setState(state => ({ ...state, timelineOps: { apply: vi.fn() } as never,
    data: { ...state.data, isLoading: false, data: {} as never },
    playback: { ...state.playback, previewRef: { current: previewHandle } as never } }));
  startEditorTour();
  const view = render(<TimelineStoreProvider store={store}>
    <div data-testid="thumbnail"><SceneSurface source={source} sourceTime={TOUR_SCENE_SOURCE_FROM} width={320} height={180} /></div>
    <div data-editor-tour="preview"><SceneSurface source={source} sourceTime={TOUR_SCENE_SOURCE_FROM} width={1280} height={720} /></div>
    <div data-editor-tour-track={EDITOR_TOUR_TRACK_IDS.scene} />
    <EditorTourTimelineDriver />
  </TimelineStoreProvider>);
  await waitFor(() => expect(view.container.querySelectorAll('iframe')).toHaveLength(3));
  const thumbnail = view.container.querySelector<HTMLIFrameElement>('[data-testid="thumbnail"] iframe')!;
  const visible = view.container.querySelector<HTMLIFrameElement>('[data-editor-tour="preview"] iframe')!;
  await waitFor(() => expect(messages(thumbnail).length).toBeGreaterThan(0));
  acknowledge(thumbnail, { kind: 'initialized' });
  acknowledge(thumbnail, { ...messages(thumbnail).at(-1), kind: 'frame' });
  expect(thumbnail).toHaveStyle({ opacity: '1' });
  expect(visible).toHaveStyle({ opacity: '0' });
  const now = performance.now.bind(performance);
  let elapsed = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now() + elapsed);
  act(() => setEditorTourBeat(1, 'land'));
  await waitFor(() => expect(previewHandle.seek).toHaveBeenCalledWith(0));
  expect(previewHandle.play).not.toHaveBeenCalled();
  elapsed = 9000;
  expect(await view.findByRole('status')).toHaveTextContent('Preparing the 3D world');
  expect(previewHandle.play).not.toHaveBeenCalled();
  acknowledge(visible, { kind: 'initialized' });
  const firstFrame = messages(visible).at(-1)!;
  expect(firstFrame).toMatchObject({ kind: 'render', sourceTime: 2.5, width: 1280, height: 720 });
  acknowledge(visible, { ...firstFrame, kind: 'frame', sourceTime: 0 });
  expect(visible).toHaveStyle({ opacity: '0' });
  expect(previewHandle.play).not.toHaveBeenCalled();
  acknowledge(visible, { ...firstFrame, kind: 'frame' });
  await waitFor(() => expect(previewHandle.play).toHaveBeenCalledOnce());
  expect(visible).toHaveStyle({ opacity: '1' });
  expect(view.container.querySelector('[data-editor-tour="preview"] [data-source-time]')).toHaveAttribute('data-source-time', '2.500');
  expect(fetch).toHaveBeenCalledOnce();
});
