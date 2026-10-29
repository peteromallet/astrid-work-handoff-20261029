import { useEffect, useMemo, useRef } from "react";
import {
  createProjectTranscriptHost,
  type ProjectTranscriptHostInput,
} from "../lib/project-transcript-host.ts";

/**
 * A source editing session follows its document owner, not render callbacks.
 * The host keeps in-memory state (the transcripts it adopted and projected), so it
 * is rebuilt only when the repository, owner or timeline changes. The asset surface,
 * item channel and pending-work service are read through `latest`: their identity
 * churns with unrelated runtime updates (for example a background job starting), and
 * a rebuild would drop the projected rows without anything asking the panel again.
 */
export function useProjectTranscriptHost(
  input: ProjectTranscriptHostInput,
  owner: object,
  timelineId: string,
) {
  const latest = useRef(input);
  latest.current = input;
  const host = useMemo(
    () =>
      createProjectTranscriptHost({
        dataRef: input.dataRef,
        repository: input.repository,
        assets: input.assets && {
          get: (key) => latest.current.assets?.get(key),
          keys: () => latest.current.assets?.keys() ?? [],
          has: (key) => latest.current.assets?.has(key) ?? false,
          search: (path, value) => latest.current.assets?.search(path, value) ?? [],
          loadProfile: async (key) => latest.current.assets?.loadProfile(key) ?? null,
        },
        items: input.items && {
          readPersisted: (ref) => latest.current.items!.readPersisted(ref),
          replacePersisted: (ref, rows) => latest.current.items!.replacePersisted(ref, rows),
          readTransient: (ref) => latest.current.items!.readTransient(ref),
          replaceTransient: (ref, rows) => latest.current.items!.replaceTransient(ref, rows),
          transientSnapshot: () => latest.current.items!.transientSnapshot(),
          subscribe: (listener) => latest.current.items!.subscribe(listener),
        },
        pendingWork: input.pendingWork && {
          report: (state) => latest.current.pendingWork?.report(state),
        },
        commitData: (...args) => latest.current.commitData(...args),
        flushPendingSave: () =>
          latest.current.flushPendingSave?.() ?? Promise.resolve(),
        editability: {
          checkTimeline: () =>
            latest.current.editability?.checkTimeline?.() ?? { allowed: true },
          check: (value) =>
            latest.current.editability?.check(value) ?? { allowed: true },
        },
        getTimelineLaneVisible: () =>
          latest.current.getTimelineLaneVisible?.() ?? false,
        setTimelineLaneVisible: (visible) =>
          latest.current.setTimelineLaneVisible?.(visible),
      }),
    // A provider may reuse its repository across timeline sessions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input.dataRef, input.repository, owner, timelineId],
  );
  useEffect(() => {
    host.start();
    void host.refreshSources();
    return () => host.dispose();
  }, [host]);
  return host;
}
