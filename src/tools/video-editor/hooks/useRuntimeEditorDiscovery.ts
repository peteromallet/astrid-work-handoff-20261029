import { useEffect, useMemo, useState, useRef } from "react";
import { assertNativeEditorConnection } from "@/integrations/astrid/nativeEditorConnection.ts";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { AstridRuntimeClient } from "@/integrations/runtime/client.ts";
import type { Project } from "@/integrations/runtime/generated.ts";
const timelineSchema = z.looseObject({
  timeline_id: z.string().min(1),
  timeline_ulid: z.string().optional(),
  head_revision_id: z.string().nullable().optional(),
  project_id: z.string().optional(),
  name: z.string().nullable().optional(),
  slug: z.string().optional(),
  is_default: z.boolean().optional(),
  is_shot: z.boolean().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type RuntimeEditorTimeline = z.infer<typeof timelineSchema>;
function resolvePrimaryTimelineId(
  timelines: readonly RuntimeEditorTimeline[],
  reference: string | undefined,
): string | undefined {
  if (!reference) return undefined;
  return timelines.find((timeline) => timeline.timeline_id === reference)?.timeline_id
    ?? timelines.find((timeline) => timeline.timeline_ulid === reference)?.timeline_id;
}
export function normalizeRuntimeEditorTimelines(
  project: Project,
  rows: readonly RuntimeEditorTimeline[],
): RuntimeEditorTimeline[] {
  const primaryRef = typeof project.metadata?.default_timeline_id === 'string'
    ? project.metadata.default_timeline_id.trim() || undefined
    : undefined;
  const primaryId = resolvePrimaryTimelineId(rows, primaryRef);
  return rows.map((timeline) => ({
    ...timeline,
    is_shot: timeline.is_shot === true || timeline.slug?.startsWith('shot-') === true,
    is_default: primaryRef
      ? timeline.timeline_id === primaryId
      : timeline.is_default === true ||
        (timeline.is_default === undefined && timeline.slug === 'main'),
  }));
}
export function chooseRuntimeTimeline(
  project: Project,
  timelines: readonly RuntimeEditorTimeline[],
): RuntimeEditorTimeline | undefined {
  const available = timelines.filter((t) => !t.is_shot);
  const defaultId = typeof project.metadata?.default_timeline_id === 'string'
    ? project.metadata.default_timeline_id
    : undefined;
  const defaultTimelineId = resolvePrimaryTimelineId(available, defaultId);
  return (
    (defaultTimelineId
      ? available.find((t) => t.timeline_id === defaultTimelineId)
      : undefined) ??
    (!defaultId ? available.find((t) => t.is_default) : undefined) ??
    available.find((t) => t.slug === "main") ??
    available.find((t) => t.slug === "rough-cut") ??
    [...available].sort((a, b) => a.timeline_id.localeCompare(b.timeline_id))[0]
  );
}
/**
 * Discovery gates the selectors and the timeline auto-pick, not the editor
 * itself, so a failure must recover on its own. A bounded retry with
 * exponential backoff covers a transient blip; the slow poll below picks up a
 * Runtime that comes back later without the user pressing Retry.
 */
export const RUNTIME_DISCOVERY_RETRY_COUNT = 3;
export const RUNTIME_DISCOVERY_RETRY_DELAY_CAP_MS = 8_000;
export const RUNTIME_DISCOVERY_RECOVERY_POLL_MS = 15_000;
const TIMELINE_METADATA_POLL_MS = 6_000;
const runtimeDiscoveryRetryDelay = (attempt: number) =>
  Math.min(500 * 2 ** attempt, RUNTIME_DISCOVERY_RETRY_DELAY_CAP_MS);
const runtimeDiscoveryRecoveryPoll = (query: { state: { status: string } }) =>
  query.state.status === "error" ? RUNTIME_DISCOVERY_RECOVERY_POLL_MS : false;

/** Native discovery uses exactly the editor's authenticated Runtime connector. */
export function useRuntimeEditorDiscovery({
  enabled,
  projectId,
  open,
  retry = RUNTIME_DISCOVERY_RETRY_COUNT,
}: {
  enabled: boolean;
  projectId: string | null;
  open: boolean;
  /** Overridable so tests can observe an error without waiting out backoff. */
  retry?: number;
}) {
  const client = useMemo(() => new AstridRuntimeClient({ readOnly: true }), []);
  const queryClient = useQueryClient();
  const [session] = useState(() => crypto.randomUUID());
  const projectsQuery = useQuery({
    queryKey: ["runtime-editor", session, "projects"],
    enabled,
    queryFn: async ({ signal }) => {
      await assertNativeEditorConnection(signal);
      signal.throwIfAborted();
      const rows = await client.withSignal(signal).listProjects();
      signal.throwIfAborted();
      if (
        rows.some((p) => !p.project_id || !p.slug || typeof p.name !== "string")
      )
        throw new Error("Runtime returned malformed project metadata.");
      return rows.filter((p) => !p.archived);
    },
    retry,
    retryDelay: runtimeDiscoveryRetryDelay,
    refetchInterval: runtimeDiscoveryRecoveryPoll,
    staleTime: 0,
  });
  const project =
    projectsQuery.data?.find((p) => p.project_id === projectId) ?? null;
  const canonicalProjectId = project?.project_id ?? null;
  const timelinesQuery = useQuery({
    queryKey: ["runtime-editor", session, canonicalProjectId, "timelines"],
    enabled: enabled && !!project,
    queryFn: async ({ signal }) => {
      const attemptClient = client.withSignal(signal);
      const rows = z
        .array(timelineSchema)
        .parse(await attemptClient.listTimelines(canonicalProjectId!));
      signal.throwIfAborted();
      if (rows.some((t) => t.project_id && t.project_id !== canonicalProjectId))
        throw new Error(
          "Runtime returned a timeline belonging to a different project.",
        );
      return await Promise.all(rows.map(async (timeline) => {
        const name = timeline.name?.trim();
        const fallbackName = timeline.slug?.trim() && timeline.slug.trim() !== timeline.timeline_id
          ? timeline.slug.trim()
          : 'Untitled timeline';
        if (name && name !== timeline.timeline_id) return timeline;
        if (!timeline.head_revision_id) {
          return { ...timeline, name: fallbackName };
        }
        try {
          const detail = await attemptClient.getProjectParentCompositionRevision(
            canonicalProjectId!,
            timeline.timeline_id,
            timeline.head_revision_id,
          );
          const payload = detail.payload && typeof detail.payload === 'object'
            ? detail.payload as Record<string, unknown>
            : detail.parent_composition && typeof detail.parent_composition === 'object'
              ? detail.parent_composition as Record<string, unknown>
              : null;
          const detailName = typeof payload?.name === 'string' ? payload.name.trim() : '';
          const detailSlug = typeof payload?.slug === 'string' ? payload.slug.trim() : '';
          return {
            ...timeline,
            name: detailName && detailName !== timeline.timeline_id
              ? detailName
              : detailSlug && detailSlug !== timeline.timeline_id
                ? detailSlug
                : name && name !== timeline.timeline_id
                  ? name
                  : fallbackName,
            slug: timeline.slug || detailSlug || undefined,
          };
        } catch {
          signal.throwIfAborted();
          return { ...timeline, name: fallbackName };
        }
      }));
    },
    // Primary selection is project metadata, not part of timeline-list identity.
    // Derive it from cached rows so a project metadata refresh never empties the
    // query or remounts the currently selected editor document.
    select: (rows) => normalizeRuntimeEditorTimelines(project!, rows),
    retry,
    retryDelay: runtimeDiscoveryRetryDelay,
    // Terminal edits can rename a timeline without changing its saved head.
    refetchInterval: (query) => runtimeDiscoveryRecoveryPoll(query) || TIMELINE_METADATA_POLL_MS,
    staleTime: 0,
  });
  const timelineEditQueries = useQueries({
    queries: (timelinesQuery.data ?? []).map((timeline) => ({
      queryKey: ["runtime-editor", canonicalProjectId, "timeline-edit", timeline.timeline_id],
      enabled: enabled && !!project,
      queryFn: ({ signal }: { signal: AbortSignal }) => client.withSignal(signal).latestTimelineEditAt(canonicalProjectId!, timeline.timeline_id),
      staleTime: 60_000,
    })),
  });
  // Refresh edit times when the timeline list itself refreshes (e.g. after a rename),
  // not on its first load: the per-timeline queries above already fetch then.
  const listUpdatedAt = useRef(0);
  useEffect(() => {
    const updatedAt = timelinesQuery.dataUpdatedAt;
    const previous = listUpdatedAt.current;
    listUpdatedAt.current = updatedAt;
    if (!canonicalProjectId || !updatedAt || !previous || previous === updatedAt) return;
    void queryClient.invalidateQueries({
      queryKey: ["runtime-editor", canonicalProjectId, "timeline-edit"],
    });
  }, [canonicalProjectId, queryClient, timelinesQuery.dataUpdatedAt]);
  const { refetch: refreshProjects } = projectsQuery,
    { refetch: refreshTimelines } = timelinesQuery;
  useEffect(() => {
    if (!enabled || !open) return;
    void refreshProjects();
    if (canonicalProjectId) void refreshTimelines();
  }, [enabled, open, canonicalProjectId, refreshProjects, refreshTimelines]);
  const reconnect = async () => {
    // A refetch alone joins an unresolved initial load. Cancel it first so Retry
    // owns fresh requests and React Query discards every obsolete result.
    await queryClient.cancelQueries({ queryKey: ["runtime-editor", session] });
    await refreshProjects();
    if (canonicalProjectId) await refreshTimelines();
  };
  return { projectsQuery, timelinesQuery, timelineEditQueries, project, client, reconnect, canonicalProjectId };
}
