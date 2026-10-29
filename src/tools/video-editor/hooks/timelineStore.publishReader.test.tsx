// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TimelineReader } from '@/sdk/video/timeline/reader.ts';
import {
  TimelineStoreProvider,
  createTimelineStore,
  usePublishTimelineReader,
  useTimelineStoreApi,
} from '@/tools/video-editor/hooks/timelineStore.ts';
import { useStoreWithEqualityFn } from 'zustand/traditional';

const readerA = { id: 'a' } as unknown as TimelineReader;
const readerB = { id: 'b' } as unknown as TimelineReader;

function Subscriber({ onReader }: { onReader: (reader: TimelineReader | null) => void }) {
  const store = useTimelineStoreApi();
  const reader = useStoreWithEqualityFn(store, (state) => state.timelineReader);
  onReader(reader);
  return null;
}

function Provider({ store, reader, onReader }: {
  store: ReturnType<typeof createTimelineStore>;
  reader: TimelineReader;
  onReader: (reader: TimelineReader | null) => void;
}) {
  usePublishTimelineReader(store, reader);
  return (
    <TimelineStoreProvider store={store}>
      <Subscriber onReader={onReader} />
    </TimelineStoreProvider>
  );
}

describe('usePublishTimelineReader', () => {
  afterEach(() => vi.restoreAllMocks());

  it('publishes a replaced reader to a mounted subscriber without a store write during render', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createTimelineStore();
    const seen: Array<TimelineReader | null> = [];
    const onReader = (reader: TimelineReader | null) => { seen.push(reader); };

    const view = render(<Provider store={store} reader={readerA} onReader={onReader} />);
    expect(store.getState().timelineReader).toBe(readerA);

    act(() => {
      view.rerender(<Provider store={store} reader={readerB} onReader={onReader} />);
    });

    expect(store.getState().timelineReader).toBe(readerB);
    expect(seen.at(-1)).toBe(readerB);
    expect(
      consoleError.mock.calls.filter((call) => String(call[0]).includes('Cannot update a component')),
    ).toEqual([]);
  });
});
