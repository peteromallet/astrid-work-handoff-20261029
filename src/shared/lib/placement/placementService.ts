/**
 * Placement service — the ONLY I/O path for document-native placement on
 * non-editor surfaces.
 *
 * Every mutation is one compare-and-swap cycle: load head → run a pure
 * document mutation (`documentPlacement.ts`) → CAS save. The cycle rides the editor's own Runtime path
 * (`RuntimeDataProvider.saveTimelineAtHead`: an immutable parent-composition
 * revision published with `expected_head`). A stale head answers `timeline_version_conflict`; the cycle
 * reloads and re-runs against the new head, bounded — exhaustion surfaces
 * the canonical {@link TimelineVersionConflictError} instead of pretending
 * success.
 *
 * There is no relational placement route here or anywhere else: no
 * junction-table writes, no placement RPC. Reads derive from the same single
 * document plus the gallery reads.
 */

import { AstridLocalClient } from '@/integrations/astrid/client';
import { RuntimeDataProvider } from '@/integrations/runtime/dataProvider';
import { TimelineVersionConflictError, isTimelineVersionConflictError } from '@/sdk/video/timeline/errors';
import { resolveGenerationAsset } from '@/tools/video-editor/data/generationAssetResolver';
import type { TimelineConfig } from '@/tools/video-editor/types/index';
import {
  batchUpdateFramesInDocument,
  placeGenerationInDocument,
  readPlacements,
  removeEntryFromDocument,
  type FrameUpdate,
  type PlacementDocument,
  type ShotPlacement,
} from './documentPlacement';

/** Placement is recomputable, so one re-read-and-reapply on a stale head. */
const RUNTIME_PUBLISH_ATTEMPTS = 2;

const GALLERY_PAGE_LIMIT = 100;
/** Journey-scale bound: enough pages that panels see every generation without unbounded paging. */
const GALLERY_MAX_ROWS = 500;

export class PlacementProjectMissingError extends Error {
  constructor(projectSlug: string) {
    super(`No default timeline found for project ${projectSlug}`);
    this.name = 'PlacementProjectMissingError';
  }
}

/** Explicit document head selected by the editor. Mutations must never infer it. */
export interface ActiveTimelineTarget {
  projectSlug: string;
  timelineRef: string;
  configVersion: number;
  /**
   * Workspace v1 head the editor selected (numeric versions are provider-local
   * counters and cannot be compared across providers). Checked when present.
   */
  headRevisionId?: string | null;
  /** Transitional non-editor placement callers may retain bounded CAS rebase. */
  allowVersionRebase?: boolean;
}

export interface LoadedDocument extends PlacementDocument {
  expectedVersion: number;
  headRevisionId?: string | null;
}

/** One load/save pair over the Runtime (workspace.v1). */
interface DocumentStore {
  load(): Promise<LoadedDocument>;
  save(document: LoadedDocument): Promise<number>;
  attempts: number;
}

/**
 * The document head as the Runtime serves it: `RuntimeDataProvider` reads the parent-composition
 * revision (config and registry), because `GET /v1/projects/:p/timelines/:t` answers the public timeline
 * resource without either. `headRevisionId` is `undefined` when the provider reports no head at all.
 */
export async function loadTimelineDocument(projectSlug: string, timelineRef: string): Promise<LoadedDocument> {
  const provider = new RuntimeDataProvider({ projectId: projectSlug });
  const [timeline, registry] = await Promise.all([
    provider.loadTimeline(timelineRef),
    provider.loadAssetRegistry(timelineRef),
  ]);
  return {
    config: timeline.config,
    registry,
    expectedVersion: timeline.configVersion,
    headRevisionId: timeline.head?.headRevisionId,
  };
}

function createDocumentStore(target: ActiveTimelineTarget): DocumentStore {
  const ref = target.timelineRef;
  const provider = new RuntimeDataProvider({ projectId: target.projectSlug });
  return {
    attempts: RUNTIME_PUBLISH_ATTEMPTS,
    async load() {
      const document = await loadTimelineDocument(target.projectSlug, ref);
      if (document.headRevisionId === undefined) {
        throw new TimelineVersionConflictError(`Runtime timeline ${ref} returned no head revision`);
      }
      return document;
    },
    async save(document) {
      const head = { projectId: target.projectSlug, timelineId: ref, headRevisionId: document.headRevisionId ?? null };
      return (await provider.saveTimelineAtHead(ref, document.config, head, document.registry)).configVersion;
    },
  };
}

async function resolveDefaultTimelineRef(client: AstridLocalClient, projectSlug: string): Promise<string> {
  const timelines = (await client.timelines.list()).timelines ?? [];
  if (timelines.length === 0) throw new PlacementProjectMissingError(projectSlug);
  const chosen = timelines.find((timeline) => timeline.is_default === true) ?? timelines[0];
  // The Runtime addresses timelines by canonical id.
  return chosen.timeline_id;
}

export async function mutateTimelineDocument<T>(
  target: ActiveTimelineTarget,
  mutate: (document: PlacementDocument) => T,
): Promise<{ result: T; configVersion: number }> {
  const store = createDocumentStore(target);
  const ref = target.timelineRef;

  for (let attempt = 0; attempt < store.attempts; attempt += 1) {
    const document = await store.load();
    if (!target.allowVersionRebase) {
      const stale = target.headRevisionId !== undefined && document.headRevisionId !== target.headRevisionId;
      if (stale) {
        throw new TimelineVersionConflictError(
          `Timeline ${ref} is at version ${document.expectedVersion}; expected active editor version ${target.configVersion}`,
        );
      }
    }
    const result = mutate(document);
    try {
      return { result, configVersion: await store.save(document) };
    } catch (error) {
      if (isTimelineVersionConflictError(error)) continue;
      throw error;
    }
  }
  throw new TimelineVersionConflictError(
    `Timeline placement save conflicted ${store.attempts} consecutive times`,
  );
}

async function resolveLegacyPlacementTarget(projectSlug: string): Promise<ActiveTimelineTarget> {
  const client = new AstridLocalClient({ projectSlug });
  const timelineRef = await resolveDefaultTimelineRef(client, projectSlug);
  // The loop in mutateTimelineDocument loads the head itself and rebases.
  return { projectSlug, timelineRef, configVersion: 0, allowVersionRebase: true };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface PlaceGenerationRequest {
  projectSlug: string;
  shotId: string;
  generationId: string;
  /** `undefined` → auto-position; `null` → pooled; number → explicit frame. */
  timelineFrame?: number | null;
}

/**
 * Resolve the generation's primary media through the generation detail read (single authority for
 * media addressing), then place it via one CAS cycle.
 */
export async function placeGeneration(request: PlaceGenerationRequest): Promise<ShotPlacement> {
  const resolution = await resolveGenerationAsset({
    generationId: request.generationId,
    projectSlug: request.projectSlug,
  });
  if (!resolution.ok) {
    throw new Error(resolution.diagnostic.message);
  }

  const target = await resolveLegacyPlacementTarget(request.projectSlug);
  return (await mutateTimelineDocument(target, (document) =>
    placeGenerationInDocument(document, {
      shotId: request.shotId,
      generationId: request.generationId,
      mediaRef: resolution.asset.url,
      displaySrc: resolution.asset.url,
      mimeType: resolution.asset.mimeType,
      registryEntry: resolution.asset.entry,
      timelineFrame: request.timelineFrame,
    }),
  )).result;
}

export interface UnplaceGenerationRequest {
  projectSlug: string;
  shotId: string;
  entryId: string;
  /** The generation this entry places (no id parsing — explicit is honest). */
  generationId: string;
  /**
   * `true` keeps membership as a pooled member ("set timeline_frame =
   * NULL" semantics); `false` removes the placement expression entirely.
   */
  keepAsPooled?: boolean;
}

export async function unplaceGeneration(request: UnplaceGenerationRequest): Promise<void> {
  const target = await resolveLegacyPlacementTarget(request.projectSlug);
  await mutateTimelineDocument(target, (document) => {
    const asset = document.registry.assets[`gen:${request.generationId}`];
    removeEntryFromDocument(document, request.entryId);
    // Pooling without managed media would strand a member nothing can render;
    // leave the placement removed instead.
    if (!request.keepAsPooled || !asset?.file) return;
    placeGenerationInDocument(document, {
      shotId: request.shotId,
      generationId: request.generationId,
      mediaRef: asset.file,
      displaySrc: asset.url,
      registryEntry: asset,
      timelineFrame: null,
    });
  });
}

export interface BatchFrameUpdateRequest {
  projectSlug: string;
  shotId: string;
  updates: FrameUpdate[];
}

/** Batch frame update for one shot's placements in the timeline document. */
export async function batchUpdatePlacementFrames(request: BatchFrameUpdateRequest): Promise<ShotPlacement[]> {
  const target = await resolveLegacyPlacementTarget(request.projectSlug);
  return (await mutateTimelineDocument(target, (document) =>
    batchUpdateFramesInDocument(document, request.shotId, request.updates),
  )).result;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------


export interface ProjectPlacements {
  /** Placements per shot id (ordered by frame, pooled last). */
  byShot: Map<string, ShotPlacement[]>;
  config: TimelineConfig;
  registry: { assets: Record<string, unknown> };
  configVersion: number | null;
}

/** Load the placement read model straight off the document head. */
export async function fetchProjectPlacements(projectSlug: string): Promise<ProjectPlacements> {
  const client = new AstridLocalClient({ projectSlug });
  const ref = await resolveDefaultTimelineRef(client, projectSlug);
  const { config, registry, expectedVersion } = await loadTimelineDocument(projectSlug, ref);
  return {
    byShot: readPlacements(config, registry),
    config,
    registry,
    configVersion: expectedVersion,
  };
}

export interface PlacementGalleryRow {
  generationId: string;
  name: string | null;
  type: string;
  starred: boolean;
  createdAt: string;
  updatedAt: string;
  variantCount: number;
  primaryMediaId: string | null;
}

/** Bounded gallery page walk — the row source placements merge against. */
export async function fetchGalleryRows(projectSlug: string): Promise<PlacementGalleryRow[]> {
  const client = new AstridLocalClient({ projectSlug });
  const rows: PlacementGalleryRow[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.gallery.list({ limit: GALLERY_PAGE_LIMIT, cursor });
    for (const generation of page.generations) {
      rows.push({
        generationId: generation.generation_id,
        name: generation.name,
        type: generation.type,
        starred: generation.starred,
        createdAt: generation.created_at,
        updatedAt: generation.updated_at,
        variantCount: generation.variant_count,
        primaryMediaId: generation.primary?.media_id ?? null,
      });
    }
    cursor = page.next_cursor ?? undefined;
  } while (cursor !== undefined && rows.length < GALLERY_MAX_ROWS);
  return rows;
}
