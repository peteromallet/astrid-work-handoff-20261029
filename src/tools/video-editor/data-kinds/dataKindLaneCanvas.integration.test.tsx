// @vitest-environment jsdom
// dataKind registration end to end, against a small inline extension: the
// real manifest gate, the gated ctx.dataKinds registration service, the
// bridged DataKindRegistryProvider (registration writes and DataLaneList
// snapshot reads hit ONE registry), the default useDataLanes loader over a
// resolver-backed fixture, and a TimelineCanvas lane row under the tracks
// that shows RENDERER output (not host extent bars) with the host-rendered
// whole-lane actions menu.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimelineCanvas } from '@/tools/video-editor/components/TimelineEditor/TimelineCanvas';
import {
  VideoEditorRuntimeProvider,
  type VideoEditorRuntimeContextValue,
} from '@/tools/video-editor/contexts/VideoEditorRuntimeContext';
import {
  DataKindRegistryProvider,
  useOptionalDataKindRegistryContext,
} from '@/tools/video-editor/data-kinds/DataKindRegistryContext';
import { createDataKindRegistry } from '@/tools/video-editor/data-kinds/DataKindRegistry';
import type { DataKindRegistry } from '@/tools/video-editor/data-kinds/DataKindRegistry';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data';
import type { TrackDefinition } from '@/tools/video-editor/types';
import type { TimelineAction, TimelineRow } from '@/tools/video-editor/types/timeline-canvas';
import {
  defineExtension,
  validateManifest,
  type AstridExtension,
  type ContributionId,
  type DataLaneRendererProps,
  type ExtensionId,
} from '@astrid/editor-sdk';
import { createExtensionContext } from '@/tools/video-editor/runtime/extensionContextFactory';
import { createDataKindRegistrationService } from '@/tools/video-editor/runtime/dataKindRegistrationService';

// The kind id the editor's default loader and lane-visibility preference feed.
const KIND_ID = 'astrid.transcript';
const SCHEMA_REF = 'astrid.transcript_segment/v1';
const EXTENSION_ID = 'haus.astrid.test.lane-kind' as ExtensionId;

/** A minimal data-kind extension: a renderer that paints a chip per item, and two lane actions. */
const laneKindExtension: AstridExtension = defineExtension({
  manifest: {
    id: EXTENSION_ID,
    version: '1.0.0',
    apiVersion: 1,
    license: 'MIT',
    label: 'Lane kind probe',
    contributions: [{
      id: 'lane-kind' as ContributionId,
      kind: 'dataKind',
      kindId: KIND_ID,
      schemaRef: SCHEMA_REF,
      shape: 'interval',
      domain: 'source_seconds',
      label: 'Transcript',
      order: 10,
    }],
  },
  activate(ctx) {
    const handle = ctx.dataKinds.register(
      KIND_ID,
      (props: DataLaneRendererProps) => createElement(
        'div',
        { 'data-testid': 'probe-lane-renderer' },
        props.items.map((item) => createElement(
          'span',
          { key: item.id, 'data-testid': 'probe-lane-chip' },
          String((item.payload as { text?: unknown }).text ?? ''),
        )),
      ),
      undefined,
      {
        supportsSparseItemWindows: true,
        actions: [
          { id: 'first-action', label: 'First action', invoke: () => {} },
          { id: 'second-action', label: 'Second action', invoke: () => {} },
        ],
      },
    );
    return { dispose: () => handle.dispose() };
  },
});

// ---------------------------------------------------------------------------
// Harness state (hoisted for vi.mock)
// ---------------------------------------------------------------------------

const harness = vi.hoisted(() => ({
  editorData: { current: null as unknown },
  adapters: { current: null as unknown },
}));

vi.mock('@/tools/video-editor/hooks/timelineStore', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/tools/video-editor/hooks/timelineStore')
  >();
  return {
    ...actual,
    useTimelineEditorDataSafe: () => harness.editorData.current,
    useTimelineMutableAdapters: () => harness.adapters.current,
  };
});

afterEach(() => {
  harness.editorData.current = null;
  harness.adapters.current = null;
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Transcript segments the stub resolver serves for `asset-a`. */
const FIXTURE_SEGMENTS = [
  { start: 0.5, end: 1.5, text: 'Hello from the fixture' },
  { start: 2, end: 3.25, text: 'Second fixture segment' },
];

const track: TrackDefinition = { id: 'V1', kind: 'visual', label: 'V1' };
const action: TimelineAction = { id: 'clip-1', start: 0, end: 4, effectId: 'effect-clip-1' };
const row: TimelineRow = { id: 'V1', actions: [action] };

/**
 * Base TimelineData with one sound-bearing media clip whose asset is the
 * fixture asset. `assetEntry.type` drives `getClipAssetMediaType` → `video`,
 * the same filter assembleDataLanes applies.
 */
function buildBaseData(): TimelineData {
  return {
    resolvedConfig: {
      clips: [
        {
          id: 'clip-1',
          asset: 'asset-a',
          at: 0,
          from: 0,
          to: 4,
          speed: 1,
          end: 4,
          assetEntry: { type: 'video/mp4' },
        },
      ],
    },
    rows: [],
    meta: {},
    dataLanes: [],
  } as unknown as TimelineData;
}

function buildRuntimeValue(): VideoEditorRuntimeContextValue {
  const extension = laneKindExtension;
  return {
    provider: {} as VideoEditorRuntimeContextValue['provider'],
    // Resolver-backed fixture: onProfileLoad is the seam useDataLanes'
    // default loader reads (loadTranscript prefers it). This mirrors the
    // embed-host resolver path; plain prod providers return null profiles.
    assetResolver: {
      resolveAssetUrl: async (file: string) => file,
      onProfileLoad: async () => ({ transcript: { segments: FIXTURE_SEGMENTS } }),
    },
    auth: { userId: 'user-1' },
    project: { projectId: null },
    shots: {} as VideoEditorRuntimeContextValue['shots'],
    mediaLightbox: {} as VideoEditorRuntimeContextValue['mediaLightbox'],
    agentChat: {} as VideoEditorRuntimeContextValue['agentChat'],
    toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
    telemetry: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    timelineId: 'timeline-1',
    userId: 'user-1',
    extensions: {
      slots: {},
      dialogHost: { dialogs: [] },
      registry: { panels: [], inspectorSections: [] },
      overlays: [],
    },
    extensionRuntime: {
      extensions: [extension],
      byId: new Map([[extension.manifest.id as string, extension]]),
    } as VideoEditorRuntimeContextValue['extensionRuntime'],
    commandRegistry: undefined,
    timelineOverlaysEnabled: false,
  };
}

function buildCanvasProps() {
  return {
    rows: [row],
    tracks: [track],
    deviceClass: 'desktop',
    inputModality: 'mouse',
    interactionMode: 'select',
    gestureOwner: 'none',
    scale: 1,
    scaleWidth: 100,
    scaleSplitCount: 1,
    startLeft: 0,
    rowHeight: 48,
    minScaleCount: 1,
    maxScaleCount: 10,
    selectedTrackId: null,
    getActionRender: () => <div>clip</div>,
    onSelectTrack: vi.fn(),
    onTrackChange: vi.fn(),
    onRemoveTrack: vi.fn(),
    onTrackDragEnd: vi.fn(),
    trackSensors: [] as never,
    onCursorDrag: vi.fn(),
    onClickTimeArea: vi.fn(),
    setInputModalityFromPointerType: vi.fn(() => 'mouse' as const),
    setGestureOwner: vi.fn(),
    dragSessionRef: { current: null },
  };
}

/** Records which registry instance the provider actually exposed. */
function BridgeIdentityProbe({ onRegistry }: { onRegistry: (registry: DataKindRegistry | null) => void }) {
  const value = useOptionalDataKindRegistryContext();
  onRegistry(value?.registry ?? null);
  return null;
}

/**
 * Activate the dev extension through the REAL host path: manifest gate via
 * validateManifest, then a real extension context whose ctx.dataKinds is the
 * production registration service bound to `assemblyRegistry` — the same

/**
 * Activate the extension through the REAL host path: manifest gate via
 * validateManifest, then a real extension context whose ctx.dataKinds is the
 * production registration service bound to `assemblyRegistry` - the same
 * wiring editorRuntimeAssembly.tsx builds per extension.
 */
function activateThroughRealGate(assemblyRegistry: DataKindRegistry) {
  const validation = validateManifest(laneKindExtension.manifest);
  expect(validation.errors).toEqual([]);

  const diagnosticsList: Array<Record<string, unknown>> = [];
  const diagnosticsService = {
    report(diagnostic: Record<string, unknown>): void {
      diagnosticsList.push({ ...diagnostic });
    },
    get diagnostics(): readonly Record<string, unknown>[] {
      return diagnosticsList;
    },
  };

  const dataKindsService = createDataKindRegistrationService({
    extension: laneKindExtension,
    dataKindRegistry: assemblyRegistry,
    diagnosticsService: diagnosticsService as Parameters<
      typeof createDataKindRegistrationService
    >[0]['diagnosticsService'],
  });

  const ctx = createExtensionContext(
    laneKindExtension,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    dataKindsService,
  );

  const disposeHandle = laneKindExtension.activate?.(ctx);
  expect(typeof disposeHandle?.dispose).toBe('function');
  return { diagnosticsService, dispose: () => disposeHandle?.dispose() };
}

describe('dataKind lane registration (inline extension)', () => {
  it('declares a valid dataKind contribution through the real manifest gate', () => {
    const validation = validateManifest(laneKindExtension.manifest);
    expect(validation.errors).toEqual([]);

    const contribution = laneKindExtension.manifest.contributions?.find(
      (entry) => entry.kind === 'dataKind',
    );
    expect(contribution).toMatchObject({
      kind: 'dataKind',
      kindId: KIND_ID,
      schemaRef: SCHEMA_REF,
      shape: 'interval',
      domain: 'source_seconds',
    });
  });

  it('renders renderer output under the tracks through the bridged provider', async () => {
    // The assembly-style registry instance - in the running editor this is
    // `editorRuntimeAssembly`'s `dataKindRegistryRef.current`.
    const assemblyRegistry = createDataKindRegistry();

    harness.editorData.current = { data: buildBaseData(), preferences: { showTranscriptLane: true } };
    harness.adapters.current = {
      dataRef: { current: null },
      selectedClipIdsRef: { current: new Set<string>() },
      ops: {},
      previewRef: { current: null },
    };

    const seenBridged: Array<DataKindRegistry | null> = [];
    // Real gate 2: activate BEFORE mount so registration precedes the lane
    // pipeline's first snapshot read - exactly the editor's ordering.
    activateThroughRealGate(assemblyRegistry);

    render(
      <DataKindRegistryProvider registry={assemblyRegistry}>
        <BridgeIdentityProbe onRegistry={(registry) => seenBridged.push(registry)} />
        <VideoEditorRuntimeProvider value={buildRuntimeValue()}>
          <TimelineCanvas {...buildCanvasProps()} />
        </VideoEditorRuntimeProvider>
      </DataKindRegistryProvider>,
    );

    // Bridge invariant: the provider exposed exactly the assembly-owned
    // instance - not its own creation.
    expect(seenBridged.length).toBeGreaterThan(0);
    expect(seenBridged.every((registry) => registry === assemblyRegistry)).toBe(true);

    const record = assemblyRegistry.getSnapshot().records.find((r) => r.kindId === KIND_ID);
    expect(record).toBeDefined();
    expect(record?.ownerExtensionId).toBe(EXTENSION_ID);
    expect(record?.schemaRef).toBe(SCHEMA_REF);
    expect(record?.provenance).toBe('bundled-extension');
    expect(record?.supportsSparseItemWindows).toBe(true);

    // The lane renders from fixture segments once the loader resolves...
    await waitFor(() => {
      expect(screen.getByTestId('data-lane-row')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByTestId('probe-lane-renderer')).toBeTruthy();
    });

    // ...with RENDERER OUTPUT (chips carrying fixture text), not host extent bars.
    const laneRow = screen.getByTestId('data-lane-row');
    expect(laneRow.getAttribute('data-lane-kind')).toBe(KIND_ID);
    expect(within(laneRow).queryByTestId('data-lane-extent-bar')).toBeNull();
    const chips = within(laneRow).getAllByTestId('probe-lane-chip');
    expect(chips.length).toBe(FIXTURE_SEGMENTS.length);
    expect(chips[0].textContent).toContain('Hello from the fixture');
    expect(chips[1].textContent).toContain('Second fixture segment');

    // Host-rendered whole-lane actions come from the kind registration.
    const trigger = within(laneRow).getByRole('button', { name: 'Transcript actions' });
    expect(trigger).toBeVisible();
    fireEvent.click(trigger);
    expect(screen.getAllByRole('menuitem').map((button) => button.textContent)).toEqual([
      'First action',
      'Second action',
    ]);

    // Row sits below the track rows inside the SAME scroller.
    const scroller = document.querySelector('.timeline-scroll');
    expect(scroller).toBeTruthy();
    const trackRow = scroller?.querySelector('[data-row-id]');
    const laneList = scroller?.querySelector('[data-testid="data-lane-list"]');
    expect(trackRow).toBeTruthy();
    expect(laneList).toBeTruthy();
    // DOCUMENT_POSITION_PRECEDING: the track row precedes the lane list.
    expect(
      (laneList as Node).compareDocumentPosition(trackRow as Node)
        & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });

  it('registers through the gated service, emits the registered diagnostic and unregisters on dispose', () => {
    const assemblyRegistry = createDataKindRegistry();
    const { diagnosticsService, dispose } = activateThroughRealGate(assemblyRegistry);

    const codes = diagnosticsService.diagnostics.map((d) => d.code);
    expect(codes).toContain('dataKinds/registered');
    expect(assemblyRegistry.getSnapshot().has(KIND_ID)).toBe(true);

    // Cleanup rides the returned handle.
    dispose();
    expect(assemblyRegistry.getSnapshot().has(KIND_ID)).toBe(false);
  });
});
