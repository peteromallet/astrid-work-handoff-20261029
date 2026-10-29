import { act, render, waitFor, screen, within } from '@testing-library/react';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { getEditorTourState, setEditorTourBeat } from '@/shared/state/editorTourStore';
import { finishEditorTour } from '@/tools/video-editor/tour/runner/tourBeats';
import { useTimelineEditorData, useTimelineOpsFromStoreSafe } from '@/tools/video-editor/hooks/timelineStore';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext';
import { useClipTypeRegistryContext } from '@/tools/video-editor/clip-types/ClipTypeRegistryContext';
import type { ClipRendererProps } from '@/tools/video-editor/clip-types/ClipTypeRegistry';
import type { ComponentType } from 'react';
import { TOUR_CLIP_IDS } from '@/tools/video-editor/tour/timeline/tourStages';

let captured: ReturnType<typeof useTimelineEditorData>;
let operations: ReturnType<typeof useTimelineOpsFromStoreSafe>;
let runtime: ReturnType<typeof useVideoEditorRuntime>;
// Keep the actual provider, extension activation and driver operations. Browser media and layout
// are outside jsdom: the preview boundary records the real resolved composition instead.
vi.mock('@/tools/video-editor/components/PreviewPanel/RemotionPreview.tsx', () => ({ RemotionPreview: () => {
  captured = useTimelineEditorData(); operations = useTimelineOpsFromStoreSafe(); runtime = useVideoEditorRuntime();
  const { registry } = useClipTypeRegistryContext();
  const scene = captured.resolvedConfig?.clips.find(clip => clip.clipType === 'haus.astrid.liveScene');
  const record = registry.resolve('haus.astrid.liveScene');
  if (!scene || record?.status !== 'active' || typeof record.renderer !== 'function') return <div data-testid="captured-preview" />;
  const Renderer = record.renderer as ComponentType<ClipRendererProps>;
  return <div data-testid="captured-preview"><Renderer clipId={scene.id} clipTypeId={scene.clipType!}
    time={0} sourceTime={2.5} source={scene.app as Record<string, unknown>} params={{}}
    width={1280} height={720} live={{bindings: [], diagnostics: [], getSource: () => undefined,
      getChannelMetadata: () => undefined, readLatestSample: () => undefined, readSampleAt: () => undefined,
      readSamples: () => [], getSampleCount: () => 0, resolveChannelId: () => undefined}} /></div>;
} }));
vi.mock('@/tools/video-editor/components/TimelineEditor/TimelineEditorCoreBody.tsx', () => ({ TimelineEditorCoreBody: () => null }));
vi.mock('@/tools/video-editor/tour/runner/EditorTourRunner.tsx', () => ({ EditorTourRunner: () => null }));
// A real iframe/Three.js frame cannot be driven in jsdom. Keep the shipped
// extension and its registered renderer real; stub only the iframe boundary.
vi.mock('@astrid/packs/rendering/ui/threejs-live-editor/SceneSurface', async () => {
  const React = await import('react');
  return { SceneSurface: ({ source, sourceTime, onReady }: { source?: unknown; sourceTime: number; onReady?: (reported?: unknown) => void }) => {
    React.useEffect(() => onReady?.({ events: [], shots: [], explore: null }), []);
    return <div data-testid="scene-renderer-ready" data-phase="ready" data-source-time={sourceTime}
      data-has-source={String(!!source)} />;
  } };
});
import { BrowserTourEditor } from './BrowserTourEditor';
import { EDITOR_TOUR_MEDIA } from '@/tools/video-editor/tour/tourMedia';
const requests: string[] = [];
beforeEach(() => {
  onlineManager.setOnline(true);
  requests.length = 0;
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input); requests.push(url);
    if (!url.startsWith('/astrid/onboarding/lantern-valley-14s-v1/')) throw new Error(`Unexpected workspace request: ${url}`);
    const bytes = readFileSync(`public${url}`);
    return new Response(bytes);
  }));
});
afterEach(() => vi.unstubAllGlobals());
it('admits the bundled world and applies all three stages with only shipped asset fetches', async () => {
  const onFinish = vi.fn();
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><TooltipProvider><MemoryRouter>
    <BrowserTourEditor onFinish={onFinish} />
  </MemoryRouter></TooltipProvider></QueryClientProvider>);
  const pane = screen.getByRole('complementary', { name: 'Task and chat pane' });
  expect(pane).toHaveAttribute('data-tasks-pane', 'true');
  expect(pane).toHaveAttribute('data-pane-side', 'right');
  const main = screen.getByRole('main', { name: 'Lantern Valley guided demo' });
  const header = screen.getByTestId('video-editor-header');
  expect(screen.getByTestId('global-header-slot')).toContainElement(header);
  expect(main.parentElement).toHaveAttribute('data-video-editor-route', 'true');
  expect(within(header).getAllByTestId('editor-project-timeline-selectors')).toHaveLength(1);
  expect(within(header).getAllByRole('combobox')).toHaveLength(1);
  expect(within(header).getByRole('combobox', { name: 'Select project' })).toHaveTextContent('Onboarding project');
  expect(within(header).getByRole('combobox', { name: 'Select project' })).toBeDisabled();
  expect(within(header).queryByRole('combobox', { name: 'Select timeline' })).not.toBeInTheDocument();
  expect(within(header).getByRole('button', { name: 'Project settings' })).toBeDisabled();
  expect(within(header).getByRole('button', { name: 'New project' })).toBeDisabled();
  expect(within(header).getByRole('button', { name: 'Settings' })).toBeDisabled();
  const previewNavigation = within(screen.getByTestId('video-editor-editor-navigation-controls'));
  expect(previewNavigation.getByRole('combobox', { name: 'Select timeline' })).toHaveTextContent('Lantern Valley');
  expect(previewNavigation.getByRole('combobox', { name: 'Select timeline' })).toBeDisabled();
  // The shared app content reserves the same pane width while the fixed Tasks surface stays at the right edge.
  expect(main.parentElement).toHaveStyle({ marginRight: '300px' });
  const extensionsDock = screen.getByTestId('video-editor-right-panel-dock');
  expect(extensionsDock).toHaveAttribute('data-open', 'true');
  expect(within(extensionsDock).getByRole('tab', { name: 'Inspector' })).toHaveAttribute('aria-selected', 'true');
  const chat = pane.querySelector('[data-tasks-pane-chat]')!;
  expect(within(pane).getByRole('textbox')).toHaveAttribute('readonly');
  expect(chat.querySelector('[data-editor-tour="chat-composer"]')).not.toBeNull();
  expect(chat.querySelector('[data-editor-tour="chat-transcript"]')).not.toBeNull();
  expect(chat.querySelector('[data-editor-tour="chat-send"]')).not.toBeNull();
  expect(document.querySelectorAll('[data-editor-tour="chat-composer"]')).toHaveLength(1);
  await waitFor(() => expect(operations).toBeTruthy());
  act(() => setEditorTourBeat(1, 'land', true));
  await waitFor(() => expect(captured.resolvedConfig?.clips.some(clip => clip.clipType === 'haus.astrid.liveScene')).toBe(true));
  expect(within(extensionsDock).getByRole('tab', { name: 'Extensions' })).toHaveAttribute('aria-selected', 'true');
  expect(await within(extensionsDock).findByRole('region', { name: 'World Explorer' })).toBeInTheDocument();
  await waitFor(() => expect(document.querySelector('[data-testid="scene-renderer-ready"][data-phase="ready"]')).not.toBeNull());
  expect(document.querySelector('[data-testid="scene-renderer-ready"]')).toHaveAttribute('data-has-source', 'true');
  expect(document.querySelector('[data-testid="scene-renderer-ready"]')).toHaveAttribute('data-source-time', '2.5');
  expect(runtime.provider.persistenceEnabled).toBe(false);
  expect(runtime.livePermissionService).toBeUndefined();
  act(() => setEditorTourBeat(2, 'land', true));
  await waitFor(() => expect(captured.resolvedConfig?.clips.filter(clip => (
    TOUR_CLIP_IDS.stills.includes(clip.id as typeof TOUR_CLIP_IDS.stills[number]) && clip.clipType === 'hold'
  ))).toHaveLength(4));
  act(() => setEditorTourBeat(3, 'land', true));
  await waitFor(() => expect(captured.resolvedConfig?.clips.some(clip => clip.id === TOUR_CLIP_IDS.video && clip.clipType === 'media')).toBe(true));
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every(url => url.startsWith('/astrid/onboarding/'))).toBe(true);
  expect(EDITOR_TOUR_MEDIA.video).toBeTruthy();
  // The runner's visual interaction is outside this fixture; the real finish operation must
  // still invoke the callback registered by BrowserTourEditor and stop the tour exactly once.
  expect(onFinish).not.toHaveBeenCalled();
  act(() => finishEditorTour());
  expect(onFinish).toHaveBeenCalledOnce();
  expect(getEditorTourState().status).toBe('idle');
  act(() => finishEditorTour());
  expect(onFinish).toHaveBeenCalledOnce();
});
