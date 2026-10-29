// Host-side lane pipeline hook (dataKind V2).
// Thin glue only: takes a base TimelineData and the registered-kind snapshot
// records; delegates segment fetching to the single assembly authority
// (`dataLaneAssemblyAuthority.ts` — one shared cache for every co-mounted
// consumer), then re-runs the pure data plane (`assembleDataLanes` +
// `mergeDataLanes`) to produce a patched TimelineData.
//
// Invariants:
// - The store's TimelineData is never written — the patched object is a
//   render-side merge, so lanes stay provably inert to duration/rows/export
//   (Batch 5). Lanes inform, they do not render pixels and never edit.
// - No loader (or no runtime) → the hook returns `base` identity with empty
//   lanes: the lane plane is additive and fails open to "no lanes".
// - Last-write-wins: segment fetches are keyed per (loader source,
//   timelineId) in the authority and shared across mounts; base or kinds
//   changes re-merge with the freshest cached segments instead of refetching.
// - Persisted SOURCE items (`base.sourceItemsBySchemaRef`, V2 bundle plane)
//   join host-fetched transcript segments as inputs to the same assembly.

import { useMemo, useSyncExternalStore } from 'react';
import { useTimelineStoreApiSafe } from '@/tools/video-editor/hooks/timelineStore.ts';
import type { SourceFrozenDataItem } from '@/tools/video-editor/data/typed/envelope.ts';
import { useOptionalVideoEditorRuntime } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import { getClipAssetMediaType } from '@/tools/video-editor/clip-types/runtime.ts';
import type { TimelineData, TranscriptSegment } from '@/tools/video-editor/lib/timeline-data.ts';
import { createEditorAssetSurface, loadEditorAssetProfile } from '@/tools/video-editor/runtime/editorAssetSurface.ts';
import {
  assembleDataLanes,
  mergeDataLanes,
  type DataKindSnapshotRecord,
} from '@/tools/video-editor/data/typed/assembleDataLanes.ts';
import { areLaneSegmentsResolved, useLaneSegments, type LoadDataSegments } from './dataLaneAssemblyAuthority.ts';
import { useDataKindRegistrySnapshot } from './DataKindRegistryContext.tsx';
import { playedShotComposition, playedTimelineClips } from '@/tools/video-editor/lib/timeline-shot-summaries.ts';

export type { LoadDataSegments };

const EMPTY_RESOLVED_CLIPS: TimelineData['resolvedConfig']['clips'] = [];
Object.freeze(EMPTY_RESOLVED_CLIPS);
const EMPTY_TRANSIENT_ITEMS: Readonly<Record<string, readonly SourceFrozenDataItem[]>> = Object.freeze({});

export interface UseDataLanesArgs {
  /** Base TimelineData from the timeline store (`null` → `null` out). */
  readonly base: TimelineData | null;
  /**
   * Registered-kind snapshot records. Defaults to the
   * `DataKindRegistryContext` snapshot records; pass explicitly in tests.
   */
  readonly kinds?: readonly DataKindSnapshotRecord[];
  /**
   * Segment loader. `undefined` (omitted) → default loader built from the
   * editor runtime (`loadTranscript` over `runtime.assetResolver`); explicit
   * `null` disables fetching (lanes stay empty → `base` identity).
   */
  readonly loadSegments?: LoadDataSegments | null;
}

/**
 * Assemble duration-neutral data lanes for `base` and return the patched
 * TimelineData (`base` identity when no lanes assemble).
 */
export function useDataLanePlane({ base, kinds, loadSegments }: UseDataLanesArgs): { data: TimelineData | null; resolved: boolean } {
  const contextRecords = useDataKindRegistrySnapshot().records;
  const effectiveKinds = kinds ?? contextRecords;
  const runtime = useOptionalVideoEditorRuntime();
  const itemHost = useTimelineStoreApiSafe()?.getState().dataKindItemsHost;
  const transientItems = useSyncExternalStore(
    itemHost?.subscribe ?? (() => () => {}),
    itemHost?.transientSnapshot ?? (() => EMPTY_TRANSIENT_ITEMS),
    () => EMPTY_TRANSIENT_ITEMS,
  );
  const defaultLoader = useMemo<LoadDataSegments | undefined>(() => {
    if (!runtime) return undefined;
    const assets = createEditorAssetSurface(() => null, (assetId) =>
      loadEditorAssetProfile(runtime.assetResolver, assetId, runtime.timelineId));
    return async (assetId: string) => {
      const transcript = (await assets.loadProfile(assetId))?.transcript;
      if (!transcript || typeof transcript !== 'object' || Array.isArray(transcript)) return [];
      const segments = (transcript as Record<string, unknown>).segments;
      if (!Array.isArray(segments)) return [];
      return segments.filter((segment): segment is TranscriptSegment =>
        !!segment && typeof segment === 'object'
        && typeof segment.start === 'number'
        && typeof segment.end === 'number'
        && typeof segment.text === 'string');
    };
  }, [runtime]);
  const effectiveLoader = loadSegments !== undefined ? loadSegments : defaultLoader;
  // Store bootstrap and isolated host surfaces can briefly expose a data
  // object before its resolved config is ready. Typed lanes are additive, so
  // the correct fail-open input for that frame is an empty clip list.
  const baseClips = base?.resolvedConfig?.clips ?? EMPTY_RESOLVED_CLIPS;
  const composition = playedShotComposition(runtime?.userId, runtime?.shots);
  const laneClips = useMemo(
    () => playedTimelineClips(composition, base?.resolvedConfig) ?? baseClips,
    [composition, base?.resolvedConfig, baseClips],
  );

  // Sound-bearing media clips' distinct assets, in stable order. Lanes attach
  // to evidence on media clips only — the same filter assembleDataLanes
  // applies, hoisted here so we fetch exactly what assembly can map.
  const neededAssets = useMemo(() => {
    const ids = new Set<string>();
    for (const clip of laneClips) {
      if (!clip.asset) continue;
      const media = getClipAssetMediaType(clip);
      if (media !== 'video' && media !== 'audio') continue;
      ids.add(clip.asset);
    }
    return [...ids].sort();
  }, [laneClips]);

  // Single assembly authority (L6 #6): fetching is owned by the module store
  // keyed by (loader identity source, timelineId). Co-mounted surfaces —
  // TimelineCanvas AND PropertiesPanel — share one cache and trigger exactly
  // one fetch per asset. The default loader's identity source is the runtime
  // object (stable per editor mount); an explicit loader keys under itself.
  const loaderSource: object | undefined =
    loadSegments !== undefined ? (loadSegments ?? undefined) : (runtime ?? undefined);
  const segmentsByAsset = useLaneSegments({
    loaderSource,
    timelineId: runtime?.timelineId,
    neededAssets,
    loader: effectiveLoader ?? undefined,
  });

  const data = useMemo(() => {
    if (!base) return null;
    const views = assembleDataLanes({
      kinds: effectiveKinds,
      clips: laneClips,
      segmentsByAsset,
      // V2 bundle plane: persisted SOURCE items ride on the base data and
      // feed the same assembly pass as freshly fetched transcript segments.
      sourceItemsBySchemaRef: base.sourceItemsBySchemaRef,
      transientSourceItemsBySchemaRef: transientItems,
    });
    // Base identity when nothing assembles: no clone churn, empty lanes.
    return views.length > 0 ? mergeDataLanes(base, views) : base;
  }, [base, laneClips, effectiveKinds, segmentsByAsset, transientItems]);
  return { data, resolved: !effectiveLoader || areLaneSegmentsResolved(segmentsByAsset, neededAssets) };
}

export function useDataLanes(args: UseDataLanesArgs): TimelineData | null {
  return useDataLanePlane(args).data;
}
