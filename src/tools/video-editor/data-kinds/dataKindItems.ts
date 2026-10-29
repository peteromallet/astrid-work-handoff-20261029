import type { DataKindSourceItem } from '@/sdk/video/families/dataKind.ts';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import type { CommitDataOptions } from '@/tools/video-editor/hooks/useTimelineCommit.ts';
import { buildDataFromCurrentRegistry } from '@/tools/video-editor/lib/timeline-save-utils.ts';
import { sourceFrozenDataItemSchema } from '@/tools/video-editor/data/typed/timelineBundle.ts';
import type { SourceFrozenDataItem } from '@/tools/video-editor/data/typed/envelope.ts';

export const EMPTY_DATA_KIND_ITEMS: readonly SourceFrozenDataItem[] = Object.freeze([]);

/** Validate an extension's source items before either channel accepts them. */
export function validateDataKindItems(
  schemaRef: string,
  items: readonly DataKindSourceItem[],
): readonly SourceFrozenDataItem[] {
  return Object.freeze(items.map((item) => {
    if (item.schemaRef !== schemaRef) throw new Error(`Data item must use ${schemaRef}.`);
    return sourceFrozenDataItemSchema.parse(item);
  }));
}

/** Build a saved item replacement without committing, for atomic host edits. */
export function preparePersistedDataKindItems(
  data: TimelineData,
  schemaRef: string,
  items: readonly SourceFrozenDataItem[],
  overrides?: { config?: TimelineData['config']; transcriptReferences?: TimelineData['transcriptReferences'] },
): TimelineData {
  return buildDataFromCurrentRegistry(overrides?.config ?? data.config, data, {
    sourceItemsBySchemaRef: { ...data.sourceItemsBySchemaRef, [schemaRef]: [...items] },
    ...(overrides?.transcriptReferences ? { transcriptReferences: overrides.transcriptReferences } : {}),
  });
}

export interface DataKindItemsHost {
  readPersisted(schemaRef: string): readonly SourceFrozenDataItem[];
  replacePersisted(schemaRef: string, items: readonly DataKindSourceItem[]): void;
  readTransient(schemaRef: string): readonly SourceFrozenDataItem[];
  replaceTransient(schemaRef: string, items: readonly DataKindSourceItem[]): void;
  transientSnapshot(): Readonly<Record<string, readonly SourceFrozenDataItem[]>>;
  subscribe(listener: () => void): () => void;
}

/** Provider-scoped item channels. Transient snapshots never touch TimelineData. */
export function createDataKindItemsHost(input: {
  readonly dataRef: { current: TimelineData | null };
  readonly commitData: (data: TimelineData, options?: CommitDataOptions) => void;
}): DataKindItemsHost {
  let transient: Readonly<Record<string, readonly SourceFrozenDataItem[]>> = Object.freeze({});
  const listeners = new Set<() => void>();
  return {
    readPersisted: (schemaRef) => input.dataRef.current?.sourceItemsBySchemaRef?.[schemaRef] ?? EMPTY_DATA_KIND_ITEMS,
    replacePersisted: (schemaRef, items) => {
      const data = input.dataRef.current;
      if (!data) throw new Error('Timeline data is not ready.');
      input.commitData(preparePersistedDataKindItems(data, schemaRef, validateDataKindItems(schemaRef, items)), {
        save: true,
        semantic: true,
      });
    },
    readTransient: (schemaRef) => transient[schemaRef] ?? EMPTY_DATA_KIND_ITEMS,
    replaceTransient: (schemaRef, items) => {
      const next = validateDataKindItems(schemaRef, items);
      if (JSON.stringify(transient[schemaRef] ?? []) === JSON.stringify(next)) return;
      transient = Object.freeze({ ...transient, [schemaRef]: next });
      for (const listener of listeners) listener();
    },
    transientSnapshot: () => transient,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
