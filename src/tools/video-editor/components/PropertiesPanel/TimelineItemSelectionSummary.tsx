import type { TimelineDataItemRef } from '@/shared/state/selectionStore.ts';
import type { DataLaneView } from '@/tools/video-editor/data/typed/envelope.ts';
import { useDataKindRegistrySnapshot } from '@/tools/video-editor/data-kinds/DataKindRegistryContext.tsx';
import { useOptionalVideoEditorRuntime } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';

export interface TimelineItemSelectionSummaryProps {
  readonly clipCount: number;
  readonly dataItems: readonly TimelineDataItemRef[];
  readonly lanes: readonly DataLaneView[];
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Read-only summary for mixed media and typed-data timeline selections. */
export function TimelineItemSelectionSummary({
  clipCount,
  dataItems,
  lanes,
}: TimelineItemSelectionSummaryProps) {
  const kindRecords = useDataKindRegistrySnapshot();
  const extensions = useOptionalVideoEditorRuntime()?.extensionRuntime?.extensions ?? [];
  const manifestKindLabels = new Map(extensions.flatMap((extension) =>
    (extension.manifest.contributions ?? []).flatMap((contribution) =>
      contribution.kind === 'dataKind' && contribution.kindId && contribution.label
        ? [[contribution.kindId, contribution.label] as const] : [])));
  const totalCount = clipCount + dataItems.length;
  if (totalCount === 0) return null;

  const lanesById = new Map(lanes.map((lane) => [lane.laneId, lane]));
  const selectedKinds = new Set(dataItems.map((item) => lanesById.get(item.laneId)?.kindId).filter(Boolean));
  const oneDataKind = dataItems.length > 0 && selectedKinds.size === 1;
  const selectedKindId = oneDataKind ? [...selectedKinds][0] : undefined;
  const selectedLane = selectedKindId ? lanes.find((lane) => lane.kindId === selectedKindId) : undefined;
  const kindLabel = (selectedKindId && (manifestKindLabels.get(selectedKindId) || kindRecords.get(selectedKindId)?.label)) || selectedLane?.label || 'Data';
  const title = clipCount === 0 && oneDataKind
    ? `${plural(dataItems.length, `${kindLabel.toLowerCase()} item`)} selected`
    : `${totalCount} items selected`;

  const laneCounts = new Map<string, { label: string; count: number }>();
  for (const item of dataItems) {
    const lane = lanesById.get(item.laneId);
    const kindId = lane?.kindId ?? '';
    const label = manifestKindLabels.get(kindId) || kindRecords.get(kindId)?.label || lane?.label || 'Data items';
    const existing = laneCounts.get(item.laneId);
    laneCounts.set(item.laneId, { label, count: (existing?.count ?? 0) + 1 });
  }

  const details: string[] = [];
  if (clipCount > 0) details.push(plural(clipCount, 'media clip'));
  if (dataItems.length > 0 && oneDataKind && clipCount > 0) {
    details.push(plural(dataItems.length, `${kindLabel.toLowerCase()} item`));
  } else {
    for (const { label, count } of laneCounts.values()) details.push(`${label} · ${count}`);
  }

  return (
    <section
      aria-label="Timeline selection summary"
      aria-live="polite"
      role="status"
      data-testid="timeline-item-selection-summary"
      className="rounded-md border border-border bg-card px-3 py-2 text-sm"
    >
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{details.join(' · ')}</p>
    </section>
  );
}
