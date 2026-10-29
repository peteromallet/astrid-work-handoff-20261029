// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useProjectTranscriptHost } from "./useProjectTranscriptHost.ts";
import { createEditorAssetSurface } from "../runtime/editorAssetSurface.ts";
import { createDataKindItemsHost } from "../data-kinds/dataKindItems.ts";
import { buildTimelineData } from "../lib/timeline-data.ts";
import {
  transcriptDocumentId,
  type ProjectTranscriptRepository,
  type ProjectTranscriptDocument,
} from "../data/typed/projectTranscript.ts";

describe("project transcript React session lifetime", () => {
  it("keeps a live session through StrictMode and callback changes during an import; fences a replaced owner", async () => {
    const media = `sha256:${"a".repeat(64)}`;
    const dataRef = {
      current: await buildTimelineData(
        {
          output: { resolution: "1920x1080", fps: 30, file: "out.mp4" },
          tracks: [],
          clips: [
            { id: "clip", asset: "asset", track: "t", at: 0, from: 0, to: 10 },
          ],
        },
        {
          assets: {
            asset: { file: "video.mp4", type: "video/mp4", media_id: media },
          },
        },
        (file) => file,
        1,
      ),
    };
    const documents = new Map<string, ProjectTranscriptDocument>();
    const repository: ProjectTranscriptRepository = {
      projectId: "project",
      listAll: async () => [...documents.values()],
      listForMedia: async () => [],
      get: async (id) => {
        if (!documents.has(id))
          throw Object.assign(new Error("Missing"), { status: 404 });
        return documents.get(id)!;
      },
      create: async (content, key) => {
        expect(key).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/);
        const document_id = await transcriptDocumentId(
          "project",
          media,
          content.source_id,
        );
        const d: ProjectTranscriptDocument = {
          document_id,
          project_id: "project",
          kind: "media.transcript",
          content,
          version: 1,
          created_at: "now",
          updated_at: "now",
        };
        documents.set(document_id, d);
        return d;
      },
      update: vi.fn(),
    };
    const commit = vi.fn((next) => {
      dataRef.current = next;
    });
    const owner = {};
    const view = renderHook(
      ({ owner, commit }) =>
        useProjectTranscriptHost(
          {
            dataRef,
            repository,
            commitData: commit,
            flushPendingSave: async () => 1,
          },
          owner,
          "timeline",
        ),
      {
        initialProps: { owner, commit },
        wrapper: ({ children }: { children: ReactNode }) => (
          <StrictMode>{children}</StrictMode>
        ),
      },
    );
    const live = view.result.current;
    const latestCommit = vi.fn((next) => {
      dataRef.current = next;
    });
    // An actual host notification changes the parent callbacks while import is pending.
    const unsubscribe = live.subscribe(() =>
      flushSync(() => view.rerender({ owner, commit: latestCommit })),
    );
    await act(async () => {
      const receipt = await live.importTranscript({
        associationAssetId: "asset",
        document: { segments: [{ id: "s", start: 0, end: 1, text: "hello" }] },
      });
      expect(receipt.associationSaved).toBe(true);
    });
    expect(view.result.current).toBe(live);
    expect(latestCommit).toHaveBeenCalled();
    expect(documents.size).toBe(1);
    unsubscribe();
    view.rerender({ owner: {}, commit: latestCommit });
    expect(view.result.current).not.toBe(live);
    await expect(live.listProjectSources("asset")).rejects.toThrow(
      "no longer active",
    );
    // The replacement owner reads the transcript the replaced owner imported.
    await expect(
      view.result.current.listProjectSources("asset"),
    ).resolves.toEqual([
      { documentId: [...documents.keys()][0], sourceId: "default", version: 1 },
    ]);
    const replacement = view.result.current;
    view.unmount();
    await expect(replacement.listProjectSources("asset")).rejects.toThrow(
      "no longer active",
    );
  });

  it("keeps one host across new assets, items and pendingWork identities, reading the latest of each", async () => {
    const dataRef = {
      current: await buildTimelineData(
        { output: { resolution: "1920x1080", fps: 30, file: "out.mp4" }, tracks: [], clips: [] },
        { assets: {} },
        (file) => file,
        1,
      ),
    };
    const repository: ProjectTranscriptRepository = {
      projectId: "project",
      listAll: async () => [],
      listForMedia: async () => [],
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };
    const surface = () => createEditorAssetSurface(() => dataRef.current);
    const itemsHost = () => createDataKindItemsHost({ dataRef, commitData: vi.fn() });
    const owner = {};
    const first = { assets: surface(), items: itemsHost(), pendingWork: { report: vi.fn() } };
    const view = renderHook(
      ({ work }) =>
        useProjectTranscriptHost(
          { dataRef, repository, commitData: vi.fn(), ...work },
          owner,
          "timeline",
        ),
      { initialProps: { work: first } },
    );
    await act(async () => {}); // let the mount's first refresh finish
    const live = view.result.current;
    const next = { assets: surface(), items: itemsHost(), pendingWork: { report: vi.fn() } };
    const replace = vi.spyOn(next.items, "replaceTransient");
    view.rerender({ work: next });
    expect(view.result.current).toBe(live);
    // The unchanged host reports to, and writes through, the latest surfaces.
    await act(async () => {
      await live.refreshSources();
    });
    act(() => live.setTimelineLaneVisible(true)); // emits, so reports pending work
    expect(next.pendingWork.report).toHaveBeenCalled();
    expect(first.pendingWork.report).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalled();
    view.unmount();
  });
});
