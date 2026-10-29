import { useRef, useState } from 'react';
import { clockText, button } from './ui';
import type { Row } from './rows';

/** The name being edited: Enter or blur keeps it, Escape gives up (undefined). Settles once, so a blur after Enter or Escape does nothing. */
function RenameField({ name, onDone }: { name: string; onDone: (next: string | undefined) => void }) {
  const [value, setValue] = useState(name);
  const settled = useRef(false);
  const finish = (next: string | undefined) => {
    if (settled.current) return;
    settled.current = true;
    onDone(next);
  };
  return (
    <input
      autoFocus
      aria-label="World name"
      maxLength={80}
      value={value}
      className="min-h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.target.select()}
      onKeyDown={(event) => {
        // Typing here must not reach the panel's own keys (space plays, arrows seek).
        event.stopPropagation();
        if (event.key === 'Enter') finish(value);
        else if (event.key === 'Escape') finish(undefined);
      }}
      onBlur={() => finish(value)}
    />
  );
}

/** One world in a list. Its name opens the world (double-click renames it); the pencil renames it; library rows can also be removed. */
function WorldRow({ row, removable, selected, busy, onPick, onRemove, onRename }: {
  row: Row; removable: boolean; selected: boolean; busy: boolean;
  onPick: (key: string) => void; onRemove: (row: Row) => void; onRename: (row: Row, name: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const finishRename = (next: string | undefined) => {
    setRenaming(false);
    const name = next?.trim();
    if (name && name !== row.name) onRename(row, name);
  };
  return (
    <li className="world-explorer-row relative flex min-w-0 items-center rounded-md hover:bg-muted"
      style={selected ? { background: 'hsl(var(--primary) / 0.12)' } : undefined}
    >
      {renaming ? (
        <RenameField name={row.name} onDone={finishRename} />
      ) : (
        <button
          type="button"
          className="min-h-8 min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-current={selected ? 'true' : undefined}
          onClick={() => onPick(row.key)}
          onDoubleClick={() => setRenaming(true)}
        >
          {row.name}{row.qualifier ? <span className="text-muted-foreground"> · {row.qualifier}</span> : null} <span className="tabular-nums text-muted-foreground">{clockText(row.duration)}</span>
          {row.uses.length ? <span className="text-muted-foreground"> · {row.uses.length} clip{row.uses.length === 1 ? '' : 's'}</span> : null}
        </button>
      )}
      <button
        type="button"
        aria-label={`Rename ${row.name}`}
        title={`Rename ${row.name}`}
        disabled={busy}
        className={`world-explorer-rename absolute ${removable ? 'right-9' : 'right-1'} flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50`}
        onClick={() => setRenaming(true)}
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
      </button>
      {removable ? (
        <button
          type="button"
          aria-label={`Remove ${row.name} from library`}
          title={`Remove ${row.name} from library`}
          disabled={busy}
          className="world-explorer-remove absolute right-1 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          onClick={() => onRemove(row)}
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      ) : null}
    </li>
  );
}

/** The project's one world list: worlds in the video, library worlds, the sample, and Import. */
export function WorldList({ timeline, library, selectedKey, sampleLabel, offerSample, busy, onPick, onRemove, onRename, onAddSample, onImport }: {
  timeline: readonly Row[]; library: readonly Row[]; selectedKey: string | undefined;
  sampleLabel: string; offerSample: boolean; busy: boolean;
  onPick: (key: string) => void; onRemove: (row: Row) => void; onRename: (row: Row, name: string) => void; onAddSample: () => void; onImport: () => void;
}) {
  const item = (row: Row, removable: boolean) => (
    <WorldRow
      key={row.key}
      row={row}
      removable={removable}
      selected={row.key === selectedKey}
      busy={busy}
      onPick={onPick}
      onRemove={onRemove}
      onRename={onRename}
    />
  );
  return (
    <div className="flex min-w-0 flex-col gap-1" role="group" aria-label="Worlds">
      {/* The remove and rename actions stay quiet until their row is hovered or has focus inside it. */}
      <style>{'.world-explorer-remove,.world-explorer-rename{opacity:0}.world-explorer-row:hover .world-explorer-remove,.world-explorer-row:focus-within .world-explorer-remove,.world-explorer-row:hover .world-explorer-rename,.world-explorer-row:focus-within .world-explorer-rename{opacity:1}'}</style>
      {timeline.length ? (
        <>
          <p className="px-2 text-[10px] uppercase tracking-wide text-muted-foreground">In this video</p>
          <ul aria-label="In this video" className="flex flex-col gap-0.5">{timeline.map((row) => item(row, false))}</ul>
        </>
      ) : null}
      {library.length ? (
        <>
          <p className="px-2 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground">Library</p>
          <ul aria-label="Library" className="flex flex-col gap-0.5">{library.map((row) => item(row, true))}</ul>
        </>
      ) : null}
      <div className="flex flex-wrap items-center gap-1 pt-1">
        {offerSample ? (
          <button type="button" className={`${button} border border-border`} disabled={busy} onClick={onAddSample}>Add {sampleLabel} (sample)</button>
        ) : null}
        <button type="button" className={`${button} border border-border`} disabled={busy} onClick={onImport}>Import world…</button>
      </div>
    </div>
  );
}
