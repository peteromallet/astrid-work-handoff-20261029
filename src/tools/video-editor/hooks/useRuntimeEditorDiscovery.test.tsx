vi.mock("@/integrations/astrid/nativeEditorConnection.ts", () => ({
  assertNativeEditorConnection: vi.fn(async () => undefined),
}));
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { AstridRuntimeClient } from "@/integrations/runtime/client.ts";
import {
  useRuntimeEditorDiscovery,
  chooseRuntimeTimeline,
  normalizeRuntimeEditorTimelines,
} from "./useRuntimeEditorDiscovery.ts";
import type { Project } from "@/integrations/runtime/generated.ts";
const project = (id: string): Project => ({
  project_id: id,
  realm_id: "realm",
  slug: `slug-${id}`,
  name: `Project ${id}`,
  metadata: {},
  version: 1,
  created_at: "now",
  updated_at: "now",
});
function wrapper() {
  const q = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={q}>{children}</QueryClientProvider>
  );
}
afterEach(() => vi.restoreAllMocks());
beforeAll(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = vi.fn();
});
describe("native Runtime discovery", () => {
  it("refreshes a terminal rename while the timeline picker stays closed", async () => {
    vi.useFakeTimers();
    vi.spyOn(AstridRuntimeClient.prototype, "listProjects").mockResolvedValue([project("a")]);
    const read = vi.spyOn(AstridRuntimeClient.prototype, "listTimelines")
      .mockResolvedValue([{ project_id: "a", timeline_id: "a-main", name: "Before" }]);
    const hook = renderHook(() => useRuntimeEditorDiscovery({
      enabled: true, projectId: "a", open: false,
    }), { wrapper: wrapper() });
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(10); });
      await act(async () => { await vi.advanceTimersByTimeAsync(10); });
      expect(hook.result.current.timelinesQuery.data?.[0].name).toBe("Before");
      read.mockResolvedValue([{ project_id: "a", timeline_id: "a-main", name: "After" }]);
      await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });
      expect(hook.result.current.timelinesQuery.data?.[0].name).toBe("After");
    } finally { hook.unmount(); vi.useRealTimers(); }
  });
  it("discovers canonical projects, then scopes timeline reads to the selected real project", async () => {
    vi.spyOn(AstridRuntimeClient.prototype, "listProjects").mockResolvedValue([
      project("a"),
      project("b"),
    ]);
    const read = vi
      .spyOn(AstridRuntimeClient.prototype, "listTimelines")
      .mockImplementation(async (id) => [
        { project_id: id, timeline_id: `${id}-main`, name: "Main" },
      ]);
    const hook = renderHook(
      ({ id }) =>
        useRuntimeEditorDiscovery({
          enabled: true,
          projectId: id,
          open: false,
        }),
      { initialProps: { id: null as string | null }, wrapper: wrapper() },
    );
    await waitFor(() =>
      expect(hook.result.current.projectsQuery.isSuccess).toBe(true),
    );
    expect(read).not.toHaveBeenCalled();
    hook.rerender({ id: "b" });
    await waitFor(() =>
      expect(hook.result.current.timelinesQuery.data?.[0].timeline_id).toBe(
        "b-main",
      ),
    );
    expect(hook.result.current.project?.slug).toBe("slug-b");
    expect(read).toHaveBeenCalledWith("b");
  });
  it("does not substitute a project for a missing explicit ID and rejects cross-project rows", async () => {
    vi.spyOn(AstridRuntimeClient.prototype, "listProjects").mockResolvedValue([
      project("a"),
    ]);
    const read = vi
      .spyOn(AstridRuntimeClient.prototype, "listTimelines")
      .mockResolvedValue([{ project_id: "other", timeline_id: "foreign" }]);
    const h = renderHook(
      ({ id }) =>
        useRuntimeEditorDiscovery({
          enabled: true,
          projectId: id,
          open: false,
          retry: 0,
        }),
      { initialProps: { id: "missing" }, wrapper: wrapper() },
    );
    await waitFor(() =>
      expect(h.result.current.projectsQuery.isSuccess).toBe(true),
    );
    expect(h.result.current.project).toBeNull();
    expect(read).not.toHaveBeenCalled();
    h.rerender({ id: "a" });
    await waitFor(() =>
      expect(h.result.current.timelinesQuery.isError).toBe(true),
    );
    expect(h.result.current.timelinesQuery.data).toBeUndefined();
  });
  it("fences late reads when project selection changes", async () => {
    vi.spyOn(AstridRuntimeClient.prototype, "listProjects").mockResolvedValue([
      project("a"),
      project("b"),
    ]);
    let release!: (v: Record<string, unknown>[]) => void;
    vi.spyOn(AstridRuntimeClient.prototype, "listTimelines").mockImplementation(
      (id) =>
        id === "a"
          ? new Promise((resolve) => {
              release = resolve;
            })
          : Promise.resolve([{ timeline_id: "b-main", project_id: "b" }]),
    );
    const h = renderHook(
      ({ id }) =>
        useRuntimeEditorDiscovery({
          enabled: true,
          projectId: id,
          open: false,
        }),
      { initialProps: { id: "a" }, wrapper: wrapper() },
    );
    await waitFor(() => expect(release).toBeDefined());
    h.rerender({ id: "b" });
    await waitFor(() =>
      expect(h.result.current.timelinesQuery.data?.[0].timeline_id).toBe(
        "b-main",
      ),
    );
    await act(async () =>
      release([{ timeline_id: "a-main", project_id: "a" }]),
    );
    expect(h.result.current.timelinesQuery.data?.[0].timeline_id).toBe(
      "b-main",
    );
  });
  it("recovers from a single failed discovery request without a sticky error", async () => {
    const list = vi
      .spyOn(AstridRuntimeClient.prototype, "listProjects")
      .mockRejectedValueOnce(new Error("Runtime busy"))
      .mockResolvedValue([project("a")]);
    const h = renderHook(
      () =>
        useRuntimeEditorDiscovery({
          enabled: true,
          projectId: "a",
          open: false,
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(h.result.current.projectsQuery.isSuccess).toBe(true));
    expect(h.result.current.projectsQuery.error).toBeNull();
    expect(h.result.current.project?.project_id).toBe("a");
    expect(list).toHaveBeenCalledTimes(2);
  });
  it("selects a legitimate default or deterministic existing timeline without using absent metadata", () => {
    expect(
      chooseRuntimeTimeline(
        { ...project("a"), metadata: { default_timeline_id: "absent" } },
        [{ timeline_id: "z" }, { timeline_id: "a" }],
      )?.timeline_id,
    ).toBe("a");
    expect(
      chooseRuntimeTimeline(
        { ...project("a"), metadata: { default_timeline_id: "z" } },
        [{ timeline_id: "z" }, { timeline_id: "a" }],
      )?.timeline_id,
    ).toBe("z");
    expect(chooseRuntimeTimeline(project("a"), [])).toBeUndefined();
  });
  it("prefers an exact canonical ID over another row's colliding alias", () => {
    const selected = { ...project("a"), metadata: { default_timeline_id: "shared-ref" } };
    const rows = [
      { timeline_id: "alias-match", timeline_ulid: "shared-ref", slug: "older" },
      { timeline_id: "shared-ref", timeline_ulid: "other-alias", slug: "main" },
    ];
    const normalized = normalizeRuntimeEditorTimelines(selected, rows);
    expect(normalized.map((timeline) => timeline.is_default)).toEqual([false, true]);
    expect(chooseRuntimeTimeline(selected, normalized)?.timeline_id).toBe("shared-ref");
  });
  it("updates the primary marker from refreshed project metadata without dropping timeline rows", async () => {
    const initialProject = {
      ...project("a"),
      metadata: { default_timeline_id: "timeline-a" },
    };
    const refreshedProject = {
      ...initialProject,
      version: 2,
      metadata: { default_timeline_id: "timeline-b" },
    };
    const listProjects = vi.spyOn(AstridRuntimeClient.prototype, "listProjects")
      .mockResolvedValueOnce([initialProject])
      .mockResolvedValue([refreshedProject]);
    const listTimelines = vi.spyOn(AstridRuntimeClient.prototype, "listTimelines")
      .mockResolvedValue([
        { project_id: "a", timeline_id: "timeline-a", name: "Timeline A" },
        { project_id: "a", timeline_id: "timeline-b", name: "Timeline B" },
      ]);
    const observedTimelineIds: Array<string[] | undefined> = [];
    const h = renderHook(
      () => {
        const discovery = useRuntimeEditorDiscovery({ enabled: true, projectId: "a", open: false });
        observedTimelineIds.push(discovery.timelinesQuery.data?.map((timeline) => timeline.timeline_id));
        return discovery;
      },
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(h.result.current.timelinesQuery.data?.[0].is_default).toBe(true));
    expect(listTimelines).toHaveBeenCalledTimes(1);
    await act(async () => {
      await h.result.current.projectsQuery.refetch();
    });
    await waitFor(() => {
      expect(h.result.current.timelinesQuery.data?.find((timeline) => timeline.is_default)?.timeline_id)
        .toBe("timeline-b");
    });

    expect(h.result.current.timelinesQuery.data).toEqual([
      expect.objectContaining({ timeline_id: "timeline-a", is_default: false }),
      expect.objectContaining({ timeline_id: "timeline-b", is_default: true }),
    ]);
    expect(listTimelines).toHaveBeenCalledTimes(1);
    expect(listProjects).toHaveBeenCalledTimes(2);
    const firstLoadedSnapshot = observedTimelineIds.findIndex((ids) => ids?.length === 2);
    expect(firstLoadedSnapshot).toBeGreaterThanOrEqual(0);
    expect(observedTimelineIds.slice(firstLoadedSnapshot).every((ids) => ids?.length === 2)).toBe(true);
  });
  it("uses project metadata as primary, detects shot slugs, and recovers unnamed labels from Runtime", async () => {
    const selected = { ...project("a"), metadata: { default_timeline_id: "main-alias" } };
    expect(normalizeRuntimeEditorTimelines(selected, [
      { timeline_id: "stale-primary", slug: "old-main", is_default: true },
      { timeline_id: "main-id", timeline_ulid: "main-alias", slug: "main", name: "", head_revision_id: "revision-1" },
      { timeline_id: "shot-id", slug: "shot-opening" },
    ])).toEqual(expect.arrayContaining([
      expect.objectContaining({ timeline_id: "stale-primary", is_default: false }),
      expect.objectContaining({ timeline_id: "main-id", is_default: true }),
      expect.objectContaining({ timeline_id: "shot-id", is_shot: true }),
    ]));
    vi.spyOn(AstridRuntimeClient.prototype, "listProjects").mockResolvedValue([selected]);
    vi.spyOn(AstridRuntimeClient.prototype, "listTimelines").mockResolvedValue([
      { project_id: "a", timeline_id: "main-id", timeline_ulid: "main-alias", slug: "main", name: "", head_revision_id: "revision-1" },
    ]);
    vi.spyOn(AstridRuntimeClient.prototype, "getProjectParentCompositionRevision").mockResolvedValue({
      payload: { name: "Recovered Main Name", slug: "main" },
    });
    const h = renderHook(
      () => useRuntimeEditorDiscovery({ enabled: true, projectId: "a", open: false }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(h.result.current.timelinesQuery.data?.[0].name).toBe("Recovered Main Name"));
    expect(chooseRuntimeTimeline(selected, h.result.current.timelinesQuery.data ?? [])?.timeline_id).toBe("main-id");
  });
});
