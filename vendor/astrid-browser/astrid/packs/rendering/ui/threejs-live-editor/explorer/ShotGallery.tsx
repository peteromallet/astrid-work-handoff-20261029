import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react';
import type { PanelClipDragProps } from '@astrid/editor-sdk';
import { useShotStill } from '../useShotStill';
import { clockText } from './ui';

/** A 3 x 3 grid per page. */
export const SHOTS_PER_PAGE = 9;

export type GalleryShot = { readonly name: string; readonly start: number; readonly end: number };

/** Case-insensitive name match; blank query keeps everything. Keeps each shot's index in the full list. */
export function filterShots<T extends { readonly name: string }>(shots: readonly T[], query: string): { shot: T; index: number }[] {
  const needle = query.trim().toLowerCase();
  const all = shots.map((shot, index) => ({ shot, index }));
  return needle ? all.filter(({ shot }) => shot.name.toLowerCase().includes(needle)) : all;
}

export const pageCount = (matches: number, perPage = SHOTS_PER_PAGE) => Math.max(1, Math.ceil(matches / perPage));

const GRIP = (
  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.8" /><circle cx="15" cy="6" r="1.8" /><circle cx="9" cy="12" r="1.8" /><circle cx="15" cy="12" r="1.8" /><circle cx="9" cy="18" r="1.8" /><circle cx="15" cy="18" r="1.8" /></svg>
);
const PLUS = (
  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
);

function Still({ revision, start, name }: { revision: string; start: number; name: string }) {
  const still = useShotStill(revision, start);
  if (still.status === 'ready') {
    return <img src={still.url} alt="" draggable={false} className="h-full w-full object-cover" width={320} height={180} />;
  }
  return (
    <div
      className={`grid h-full w-full place-items-center text-[10px] text-muted-foreground ${still.status === 'error' ? '' : 'animate-pulse'}`}
      style={{ background: 'hsl(var(--muted) / 0.6)' }}
      role="img"
      aria-label={still.status === 'error' ? `No preview for ${name}` : `Loading preview of ${name}`}
    >
      {still.status === 'error' ? 'No preview' : null}
    </div>
  );
}

/** The one action slot per card: in the caption row, never on the still. Faint at rest, solid on hover, focus or touch. */
const ACTION = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-foreground opacity-60 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 [@media(hover:none)]:opacity-100';

/** The ring sits on the still, above the image, and never outside the card's box. */
const RING = 'pointer-events-none absolute inset-0 rounded group-hover/card:shadow-[inset_0_0_0_1px_hsl(var(--border))] group-focus-visible/shot:shadow-[inset_0_0_0_2px_hsl(var(--ring))]';

export function ShotCard({ shot, index, current, revision, fullscreen, addDisabled, addTitle, dragProps, onSelect, onAdd }: {
  shot: GalleryShot; index: number; current: boolean; revision: string; fullscreen: boolean;
  addDisabled: boolean; addTitle?: string;
  dragProps: PanelClipDragProps | null;
  onSelect: (index: number) => void; onAdd: (index: number) => void;
}) {
  const card = useRef<HTMLLIElement>(null);
  const range = `${clockText(shot.start)} – ${clockText(shot.end)}`;
  return (
    <li ref={card} className="group/card relative flex min-w-0 flex-col gap-1" data-shot-card data-current={current ? 'true' : undefined}>
      <button
        type="button"
        aria-current={current ? 'true' : undefined}
        aria-label={`${shot.name}, ${range}`}
        title={`Play ${shot.name}`}
        className="group/shot flex min-w-0 flex-col gap-1 p-0 text-left focus-visible:outline-none"
        onClick={() => onSelect(index)}
      >
        <span className="relative block aspect-video w-full overflow-hidden rounded" style={{ background: '#05060f' }}>
          <Still revision={revision} start={shot.start} name={shot.name} />
          <span
            aria-hidden="true"
            className={RING}
            style={current ? { boxShadow: 'inset 0 0 0 2px hsl(var(--primary) / 0.7)' } : undefined}
          />
        </span>
        <span className={`block truncate text-xs font-medium leading-tight ${current ? 'text-primary' : ''}`}>{shot.name}</span>
      </button>
      <div className="flex h-6 min-w-0 items-center justify-between">
        <span className="min-w-0 truncate text-[10px] tabular-nums leading-tight text-muted-foreground">{range}</span>
        {fullscreen ? (
          <button
            type="button"
            aria-label={`Add ${shot.name} to video`}
            title={addTitle ?? 'Add to video at the playhead'}
            disabled={addDisabled}
            className={ACTION}
            onClick={() => onAdd(index)}
          >
            {PLUS}
          </button>
        ) : dragProps ? (
          <button
            type="button"
            {...dragProps}
            aria-label={`Add ${shot.name} to video, or drag it onto the timeline`}
            title={addDisabled && addTitle ? addTitle : 'Drag onto the timeline (Enter adds at the playhead)'}
            data-testid="shot-drag-handle"
            aria-disabled={addDisabled || undefined}
            className={`${ACTION} cursor-grab active:cursor-grabbing ${addDisabled ? 'opacity-50' : ''}`}
            onClick={() => { if (!addDisabled) onAdd(index); }}
            onDragStart={(event: DragEvent<HTMLButtonElement>) => {
              dragProps.onDragStart(event);
              try { if (card.current) event.dataTransfer.setDragImage(card.current, 16, 16); } catch { /* the default ghost is fine */ }
            }}
          >
            {GRIP}
          </button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The Shots view: one searchable, paged gallery (3 x 3 per page) of a world's shots, each with its
 * start-frame still. Docked, a card's grip drags the shot onto the timeline; in full screen the
 * timeline is covered, so a card offers "Add to video" instead.
 */
export function ShotGallery({ shots, currentIndex, revision, fullscreen, addDisabled, addTitle, dragPropsFor, onSelect, onAdd }: {
  shots: readonly GalleryShot[];
  currentIndex: number;
  revision: string;
  fullscreen: boolean;
  addDisabled: boolean;
  addTitle?: string;
  dragPropsFor: (index: number) => PanelClipDragProps | null;
  onSelect: (index: number) => void;
  onAdd: (index: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [requestedPage, setRequestedPage] = useState(0);
  const searchId = useId();
  const matches = useMemo(() => filterShots(shots, query), [shots, query]);
  const pages = pageCount(matches.length);
  const page = Math.min(requestedPage, pages - 1);
  const visible = matches.slice(page * SHOTS_PER_PAGE, (page + 1) * SHOTS_PER_PAGE);
  const searching = query.trim() !== '';
  // A different world starts again from the first page with no filter.
  const lastRevision = useRef(revision);
  useEffect(() => {
    if (lastRevision.current === revision) return;
    lastRevision.current = revision;
    setQuery('');
    setRequestedPage(0);
  }, [revision]);

  // The pager's width comes from the whole world's page count, so it never moves while paging or searching.
  const pagerWidth = `${String(pageCount(shots.length)).length * 2 + 3}ch`;

  // The world's shot count lives in the placeholder; "3 of 12" appears beside the field only while searching.
  const placeholder = shots.length === 0 ? 'Search shots' : `Search ${shots.length} ${shots.length === 1 ? 'shot' : 'shots'}`;

  return (
    <section aria-label="Shots" className="flex min-w-0 flex-col gap-2" data-testid="shot-gallery">
      {/* The search row stays at the top of the scroller while the cards scroll under it. The pager sits last, so its place never moves. */}
      <div className="sticky top-0 z-10 flex items-center gap-2 pb-2 pt-2" style={{ background: 'var(--explorer-surface, hsl(var(--background)))' }}>
        <label htmlFor={searchId} className="sr-only">Search shots</label>
        <div className="relative min-w-0 flex-1">
        <input
          id={searchId}
          type="search"
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          className="min-h-10 w-full min-w-0 appearance-none [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:appearance-none rounded-md border border-border/70 bg-transparent pl-2 pr-7 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8"
          onChange={(event) => { setQuery(event.target.value); setRequestedPage(0); }}
          onKeyDown={(event) => { if (event.key === 'Escape' && query) { event.stopPropagation(); setQuery(''); setRequestedPage(0); } }}
        />
        {query && matches.length > 0 ? (
          <button
            type="button"
            aria-label="Clear search"
            className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => { setQuery(''); setRequestedPage(0); }}
          >
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        ) : null}
        </div>
        <span aria-live="polite" className="shrink-0 text-[11px] tabular-nums text-muted-foreground empty:hidden">{searching ? `${matches.length} of ${shots.length}` : null}</span>
        {pages > 1 ? (
          <nav aria-label="Shots pages" className="flex h-8 shrink-0 items-center overflow-hidden rounded-md border border-border/70">
            <button type="button" aria-label="Previous page" className="flex h-full w-8 shrink-0 items-center justify-center border-r border-border/70 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-40" disabled={page === 0} onClick={() => setRequestedPage(page - 1)}>‹</button>
            <span className="flex h-full items-center justify-center border-r border-border/70 text-center text-[11px] tabular-nums text-muted-foreground" style={{ width: pagerWidth }} aria-live="polite" aria-label={`Page ${page + 1} of ${pages}`}>{page + 1} / {pages}</span>
            <button type="button" aria-label="Next page" className="flex h-full w-8 shrink-0 items-center justify-center text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-40" disabled={page >= pages - 1} onClick={() => setRequestedPage(page + 1)}>›</button>
          </nav>
        ) : null}
      </div>

      {matches.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
          {searching ? (
            <>
              <p>No shots match &ldquo;{query.trim()}&rdquo;</p>
              <button type="button" className="rounded-md border border-border/70 px-2 py-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setQuery(''); setRequestedPage(0); }}>Clear search</button>
            </>
          ) : (
            <p>This world has no shots yet. It will show its whole length as one shot.</p>
          )}
        </div>
      ) : (
        <ul aria-label="Shots" className="mb-0 mt-0 grid list-none grid-cols-3 gap-x-3 gap-y-3 p-0">
          {visible.map(({ shot, index }) => (
            <ShotCard
              key={`${index}:${shot.start}:${shot.name}`}
              shot={shot}
              index={index}
              current={index === currentIndex}
              revision={revision}
              fullscreen={fullscreen}
              addDisabled={addDisabled}
              addTitle={addTitle}
              dragProps={fullscreen ? null : dragPropsFor(index)}
              onSelect={onSelect}
              onAdd={onAdd}
            />
          ))}
        </ul>
      )}

    </section>
  );
}

/**
 * Explore's preview of the world's shots: a header ("Shots · 12", "View shots →") over the first rows of cards, with a
 * "+N more" tile in the last slot when there are more. No search and no pager; it scrolls with the rest of the panel.
 */
export function ShotsStrip({ shots, revision, fullscreen, addDisabled, addTitle, rows = 2, dragPropsFor, onSelect, onAdd, onViewAll }: {
  shots: readonly GalleryShot[];
  revision: string;
  fullscreen: boolean;
  addDisabled: boolean;
  addTitle?: string;
  rows?: number;
  dragPropsFor: (index: number) => PanelClipDragProps | null;
  onSelect: (index: number) => void;
  onAdd: (index: number) => void;
  onViewAll: () => void;
}) {
  const slots = rows * 3;
  const overflow = shots.length > slots;
  const shown = shots.slice(0, overflow ? slots - 1 : slots);
  const more = shots.length - shown.length;
  return (
    <section aria-label="Shots" className="flex min-w-0 flex-col gap-2" data-testid="shots-strip">
      <div className="flex items-center justify-between gap-2 px-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Shots{shots.length ? ` · ${shots.length}` : ''}</p>
        {shots.length ? (
          <button type="button" className="rounded-sm text-[11px] text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onViewAll}>View shots →</button>
        ) : null}
      </div>
      {shots.length === 0 ? (
        <p className="px-2 text-[11px] text-muted-foreground">No shots in this world yet</p>
      ) : (
        <ul aria-label="Shots preview" className="mb-0 mt-0 grid list-none grid-cols-3 gap-x-3 gap-y-3 p-0">
          {shown.map((shot, index) => (
            <ShotCard
              key={`${index}:${shot.start}:${shot.name}`}
              shot={shot}
              index={index}
              current={false}
              revision={revision}
              fullscreen={fullscreen}
              addDisabled={addDisabled}
              addTitle={addTitle}
              dragProps={fullscreen ? null : dragPropsFor(index)}
              onSelect={onSelect}
              onAdd={onAdd}
            />
          ))}
          {overflow ? (
            <li className="flex min-w-0 flex-col">
              <button
                type="button"
                aria-label={`${more} more shots, view shots`}
                className="grid aspect-video w-full place-items-center rounded border border-dashed border-border/70 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={onViewAll}
              >
                +{more} more
              </button>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}
