import type { TimelineShotClipSummary, TimelineShotSummary } from '@/sdk/video/timeline/reader.ts';
import type { CanonicalShotOccurrence, PreparedShotComposition } from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import { projectCanonicalComposition, type CanonicalCompositionProjection } from '@/tools/video-editor/data/shotCompositionProjection.ts';
import { isActiveTimelineClip } from '@/tools/video-editor/data/shotCompositionTiming.ts';
import { getPlayableAssetKind } from '@/tools/video-editor/lib/timeline-asset-plans.ts';
import { getCanonicalClipPlaybackRate, getConfigTimelineClipSourceDuration } from '@/tools/video-editor/lib/timeline-domain.ts';
import type { AssetRegistry, ResolvedTimelineConfig } from '@/tools/video-editor/types/index.ts';
import type { VideoEditorShotsHost } from '@/tools/video-editor/runtime/ports.ts';

/** The composition the preview plays: a child-shot draft first, then the acknowledged graph. */
export function playedShotComposition(
  userId: string | null | undefined,
  shots: Pick<VideoEditorShotsHost, 'shotComposition' | 'canonicalComposition' | 'canonicalDraft'> | null | undefined,
): PreparedShotComposition | null {
  if (userId !== null || !shots?.shotComposition) return null;
  return shots.canonicalDraft?.composition ?? shots.canonicalComposition ?? null;
}

const played = new WeakMap<PreparedShotComposition, { base: ResolvedTimelineConfig | null; projection: CanonicalCompositionProjection | null }>();

/** The timeline with its shots' contents projected in, cached per composition and base config. */
function playedProjection(
  composition: PreparedShotComposition,
  baseConfig: ResolvedTimelineConfig | null | undefined,
): CanonicalCompositionProjection | null {
  const base = baseConfig ?? null;
  const cached = played.get(composition);
  if (cached && cached.base === base) return cached.projection;
  let projection: CanonicalCompositionProjection | null = null;
  try {
    projection = projectCanonicalComposition(composition, base);
  } catch {
    // An unprojectable graph has no readable contents; the preview reports the error.
  }
  played.set(composition, { base, projection });
  return projection;
}

/** Registry of everything the timeline plays, shot contents included. */
export function playedAssetRegistry(
  composition: PreparedShotComposition | null,
  baseConfig: ResolvedTimelineConfig | null | undefined,
): AssetRegistry | undefined {
  const config = composition ? playedProjection(composition, baseConfig)?.config : null;
  return config ? { assets: config.registry } : undefined;
}

/** Full film-time clips from the same projection used by the preview and reader. */
export function playedTimelineClips(
  composition: PreparedShotComposition | null,
  baseConfig: ResolvedTimelineConfig | null | undefined,
): ResolvedTimelineConfig['clips'] | undefined {
  return composition ? playedProjection(composition, baseConfig)?.config.clips : undefined;
}

/** Shot placements in timeline order, each with the active clips it plays. */
export function summarizeShotPlacements(
  composition: PreparedShotComposition,
  baseConfig: ResolvedTimelineConfig | null | undefined,
): TimelineShotSummary[] | undefined {
  const projection = playedProjection(composition, baseConfig);
  if (!projection) return undefined;
  const { config, clipIdentities, occurrenceIdentities } = projection;
  const clipsByPlacement = new Map<string, TimelineShotClipSummary[]>();
  for (const clip of config.clips) {
    // The projection's own identity map is the authority for which placement a clip belongs to.
    const placementId = clipIdentities.get(clip.id)?.occurrenceId;
    if (!placementId || !isActiveTimelineClip(clip)) continue;
    const rate = getCanonicalClipPlaybackRate(clip.speed);
    const sourceOffset = clip.from ?? 0;
    const assetKind = clip.asset ? getPlayableAssetKind(config.registry[clip.asset]) : null;
    const summary: TimelineShotClipSummary = {
      id: clip.id,
      track: clip.track,
      at: clip.at,
      ...(clip.clipType ? { clipType: clip.clipType } : {}),
      duration: getConfigTimelineClipSourceDuration(clip) / rate,
      sourceOffset,
      ...(typeof clip.to === 'number' ? { sourceEnd: clip.to } : {}),
      rate,
      ...(clip.asset ? { assetKey: clip.asset } : {}),
      ...(assetKind ? { assetKind } : {}),
    };
    const clips = clipsByPlacement.get(placementId) ?? [];
    clips.push(summary);
    clipsByPlacement.set(placementId, clips);
  }
  return composition.occurrences
    .filter((occurrence) => occurrenceIdentities.has(occurrence.occurrenceId))
    .map((occurrence) => ({
      id: occurrence.occurrenceId,
      shotId: occurrence.shotId,
      name: shotNameForOccurrence(occurrence),
      at: occurrence.atMs / 1000,
      duration: occurrence.durationMs / 1000,
      ...(occurrence.trackId ? { track: occurrence.trackId } : {}),
      clips: (clipsByPlacement.get(occurrence.occurrenceId) ?? []).sort((a, b) => a.at - b.at),
    }))
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Display name of a canonical shot placement, falling back to its shot id. */
export function shotNameForOccurrence(occurrence: CanonicalShotOccurrence): string {
  const canonicalName = occurrence.revision.name;
  if (typeof canonicalName === 'string' && canonicalName.trim()) return canonicalName;
  const provenance = occurrence.revision.provenance;
  if (provenance && typeof provenance === 'object' && !Array.isArray(provenance)) {
    const value = provenance as Record<string, unknown>;
    if (typeof value.name === 'string' && value.name.trim()) return value.name;
    if (typeof value.title === 'string' && value.title.trim()) return value.title;
  }
  const metadata = occurrence.revision.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const value = metadata as Record<string, unknown>;
    if (typeof value.name === 'string' && value.name.trim()) return value.name;
    if (typeof value.title === 'string' && value.title.trim()) return value.title;
  }
  return occurrence.shotId;
}
