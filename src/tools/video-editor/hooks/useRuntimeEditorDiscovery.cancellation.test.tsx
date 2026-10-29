vi.mock("@/integrations/astrid/nativeEditorConnection.ts", () => ({
  assertNativeEditorConnection: vi.fn(async () => undefined),
}));

import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertNativeEditorConnection } from "@/integrations/astrid/nativeEditorConnection.ts";
import { AstridRuntimeClient } from "@/integrations/runtime/client.ts";
import type { Project } from "@/integrations/runtime/generated.ts";
import { useRuntimeEditorDiscovery } from "./useRuntimeEditorDiscovery.ts";

const project: Project = {
  project_id: "project-a",
  realm_id: "realm-a",
  slug: "project-a",
  name: "Project A",
  metadata: {},
  version: 1,
  created_at: "now",
  updated_at: "now",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () => useRuntimeEditorDiscovery({ enabled: true, projectId: "project-a", open: false, retry: 0 }),
    { wrapper },
  );
  return { hook, queryClient };
}

async function flushQueryNotifications() {
  await act(async () => {
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(assertNativeEditorConnection).mockClear();
});

describe("Runtime editor discovery cancellation", () => {
  it("retries a pending projects request and ignores the obsolete result", async () => {
    const old = deferred<Project[]>();
    const listProjects = vi.spyOn(AstridRuntimeClient.prototype, "listProjects")
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue([project]);
    vi.spyOn(AstridRuntimeClient.prototype, "listTimelines").mockResolvedValue([]);
    vi.spyOn(AstridRuntimeClient.prototype, "latestTimelineEditAt").mockResolvedValue(null);
    const { hook } = setup();

    await flushQueryNotifications();
    expect(listProjects).toHaveBeenCalledTimes(1);
    const firstSignal = vi.mocked(assertNativeEditorConnection).mock.calls[0]?.[0];
    expect(firstSignal).toBeInstanceOf(AbortSignal);
    expect(firstSignal?.aborted).toBe(false);

    await act(async () => {
      await hook.result.current.reconnect();
    });
    await flushQueryNotifications();
    expect(hook.result.current.projectsQuery.data?.map((row) => row.project_id)).toEqual(["project-a"]);
    expect(listProjects).toHaveBeenCalledTimes(2);
    expect(firstSignal?.aborted).toBe(true);

    await act(async () => old.resolve([{ ...project, project_id: "stale", slug: "stale" }]));
    await flushQueryNotifications();
    expect(hook.result.current.projectsQuery.data?.map((row) => row.project_id)).toEqual(["project-a"]);
  });

  it("retries a pending timelines request and keeps the fresh result after the old one settles", async () => {
    const old = deferred<Record<string, unknown>[]>();
    const listProjects = vi.spyOn(AstridRuntimeClient.prototype, "listProjects").mockResolvedValue([project]);
    vi.spyOn(AstridRuntimeClient.prototype, "latestTimelineEditAt").mockResolvedValue(null);
    const listTimelines = vi.spyOn(AstridRuntimeClient.prototype, "listTimelines")
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue([{ project_id: "project-a", timeline_id: "fresh", name: "Fresh" }]);
    const { hook } = setup();

    await flushQueryNotifications();
    expect(listTimelines).toHaveBeenCalledTimes(1);
    await act(async () => {
      await hook.result.current.reconnect();
    });
    await flushQueryNotifications();
    expect(hook.result.current.timelinesQuery.data?.map((row) => row.timeline_id)).toEqual(["fresh"]);
    expect(listProjects).toHaveBeenCalledTimes(2);
    expect(listTimelines).toHaveBeenCalledTimes(2);

    await act(async () => old.resolve([{ project_id: "project-a", timeline_id: "stale", name: "Stale" }]));
    await flushQueryNotifications();
    expect(hook.result.current.timelinesQuery.data?.map((row) => row.timeline_id)).toEqual(["fresh"]);
  });
});
