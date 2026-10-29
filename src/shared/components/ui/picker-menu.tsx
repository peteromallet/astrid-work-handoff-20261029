import { forwardRef, useId, useRef, useState, type ButtonHTMLAttributes, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Check, ChevronDown, FileOutput, Pencil, Star, type LucideIcon } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/shared/components/ui/command.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover.tsx';
import { Button } from '@/shared/components/ui/button.tsx';
import { Input } from '@/shared/components/ui/input.tsx';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog.tsx';
import { toast } from '@/shared/components/ui/toast.tsx';
import { cn } from '@/shared/components/ui/contracts/cn.ts';
import { COARSE_TOUCH_TARGET } from '@/shared/components/ui/contracts/touchTarget.ts';

// The one look for the project, timeline and chat pickers (and the new-chat menu's panel):
// a chip trigger, a searchable panel, rows with a tick column and a star/rename cluster,
// a pinned footer action, and one rename dialog.

/** Every token of the query appears in the text, in any order. */
export const matches = (query: string, text: string) => query.toLowerCase().split(/\s+/).filter(Boolean).every(token => text.toLowerCase().includes(token));

/** A small icon button inside a row. */
export const ROW_BUTTON = 'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground [@media(pointer:coarse)]:h-8 [@media(pointer:coarse)]:w-8';
const REVEAL = 'opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 group-data-[selected=true]:opacity-100 [@media(hover:none)]:opacity-100';

/** The panel every picker opens. */
export const PICKER_PANEL = 'w-72 max-w-[calc(100vw-2rem)] p-0';
/** Group heading aligned with the row text, past the tick column. */
export const PICKER_GROUP = '[&_[cmdk-group-heading]]:pl-8';

// A near-opaque blurred card: the same chip on the header's paper and on any
// frame of the picture under the editor's preview overlay.
const CHIP = cn(
  'flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-border/70 bg-card/90 px-2 text-xs backdrop-blur-md',
  'text-foreground transition-colors hover:bg-accent aria-expanded:bg-accent',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'disabled:pointer-events-none disabled:opacity-50',
  COARSE_TOUCH_TARGET,
);

// The flat variant: just the name and a chevron, neutral hover/open fill, for a header that has no other boxed element.
const TITLE = cn(
  'flex h-7 min-w-0 items-center gap-1 rounded-md px-1.5 text-sm font-medium text-foreground transition-colors',
  'hover:bg-muted/60 aria-expanded:bg-muted/60',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'disabled:pointer-events-none disabled:opacity-50',
  COARSE_TOUCH_TARGET,
);

/** The starred item's mark (Primary timeline, Main chat): a filled accent star, labelled for assistive tech. */
function StarMark({ label, className }: { label: string; className?: string }) {
  return (
    <span role="img" aria-label={label} title={label} className={cn('inline-flex shrink-0 items-center justify-center text-primary', className)}>
      <Star aria-hidden="true" className="h-3 w-3 fill-current" />
    </span>
  );
}

interface PickerTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The current value's name; null while it is still arriving: a quiet bar instead of loading words. */
  label: string | null;
  /** Screen-reader text for the loading bar. */
  loadingLabel?: string;
  /** Names the star shown before the label when the current item is the starred one (chip variant). */
  starLabel?: string;
  /** `chip` (default): a bordered card for top bars. `title`: a flat name for a header of bare controls; it shows no star. */
  variant?: 'chip' | 'title';
}

/** The chip that opens a picker: the current value, then a chevron. */
export const PickerTrigger = forwardRef<HTMLButtonElement, PickerTriggerProps>(function PickerTrigger(
  { label, loadingLabel = 'Loading', starLabel, variant = 'chip', className, ...props }, ref,
) {
  return (
    <button ref={ref} type="button" className={cn(variant === 'title' ? TITLE : CHIP, 'max-w-64', variant === 'chip' && 'min-h-8', className)} {...props}>
      {label === null ? (
        <>
          {/* The Skeleton primitive's look, as a span: buttons hold phrasing content only. */}
          <span aria-hidden="true" className="inline-block h-3 w-28 animate-pulse rounded-md bg-muted" />
          <span className="sr-only">{loadingLabel}</span>
        </>
      ) : (
        <>
          {variant === 'chip' && starLabel && <StarMark label={starLabel} />}
          <span className="truncate">{label}</span>
        </>
      )}
      <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
});

/** The search field every picker panel opens with. */
export const PickerSearch = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<typeof CommandInput>>(function PickerSearch({ className, ...props }, ref) {
  return <CommandInput ref={ref} className={cn('h-8', className)} {...props} />;
});

interface PickerMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A `PickerTrigger`, which the menu wraps as the popover's trigger. */
  trigger: ReactNode;
  /** The plural noun: the group heading, the search placeholder and every state's wording. */
  plural: string;
  ariaLabel?: string;
  /** The `value` of the current row, highlighted when the panel opens. */
  currentValue?: string;
  /** How many rows there are; with none, the search and the "no match" text give way to the empty text. */
  count: number;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  /** A line under "No <plural> yet." */
  emptyHint?: string;
  /** The panel's classes; the default is the wide one. */
  panelClassName?: string;
  /** A `PickerFooterAction`, pinned under the list. */
  footer?: ReactNode;
  /** The `PickerRow`s. */
  children: ReactNode;
}

/** A popover with a searchable, looping list that opens on the current row. */
export function PickerMenu({ open, onOpenChange, trigger, plural, ariaLabel, currentValue, count, loading = false, error, onRetry, emptyHint, footer, panelClassName = PICKER_PANEL, children }: PickerMenuProps) {
  const [highlighted, setHighlighted] = useState(currentValue ?? '');
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const changeOpen = (next: boolean) => {
    if (next) setHighlighted(currentValue ?? '');
    onOpenChange(next);
  };
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      {/* Focus the search, except on touch, where it would raise the keyboard. */}
      <PopoverContent align="start" aria-label={ariaLabel} className={panelClassName}
        initialFocus={(type) => (type === 'touch' ? null : search.current) ?? root.current}>
        <Command ref={root} loop value={highlighted} onValueChange={setHighlighted} className="outline-none"
          filter={(_value, text, keywords) => matches(text, (keywords ?? []).join(' ')) ? 1 : 0}>
          {count > 0 && <PickerSearch ref={search} placeholder={`Search ${plural}…`} />}
          <CommandList className="max-h-96">
            {count > 0 && <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">No {plural} found.</CommandEmpty>}
            <CommandGroup heading={plural.charAt(0).toUpperCase() + plural.slice(1)} className={PICKER_GROUP}>
              {loading && <p role="status" className="px-2 py-2 text-xs text-muted-foreground">Loading {plural}…</p>}
              {error && (
                <div role="alert" className="space-y-2 p-2 text-xs">
                  <p>{error}</p>
                  {onRetry && <button type="button" className={cn(CHIP, 'min-h-0')} onClick={onRetry}>Retry connection</button>}
                </div>
              )}
              {!loading && !error && count === 0 && (
                <p className="px-2 py-2 text-xs text-muted-foreground">No {plural} yet.{emptyHint && ` ${emptyHint}`}</p>
              )}
              {children}
            </CommandGroup>
          </CommandList>
        </Command>
        {footer && <div className="border-t border-border p-1">{footer}</div>}
      </PopoverContent>
    </Popover>
  );
}

interface PickerRowProps {
  /** The cmdk value; the menu's `currentValue` matches it to open on the current row. */
  value: string;
  keywords?: string[];
  current?: boolean;
  onSelect: () => void;
  title: string;
  detail?: string;
  /** Sits before the detail line, e.g. the chat's agent icon. */
  detailIcon?: ReactNode;
  detailTitle?: string;
  /** This item is the starred one (Primary timeline, Main chat): a filled star, always visible. */
  starred?: boolean;
  /** Names the star mark, e.g. "Primary timeline". */
  starLabel?: string;
  /** Makes this item the starred one; shown as an outline star on hover, in the same spot. */
  onStar?: () => void;
  /** e.g. "Make Cut 2 primary". */
  starActionLabel?: string;
  /** This row's star is being set: it pulses and stays visible. */
  starPending?: boolean;
  starDisabled?: boolean;
  /** Renames the item; offered on the current row only. */
  onRename?: () => void;
  renameLabel?: string;
  /** Exports the current timeline; shown on the current row beside star/rename. */
  onExport?: () => void;
  exportLabel?: string;
}

/** A picker row: the tick, the title and detail lines, then the star and rename actions. */
export function PickerRow({
  value, keywords, current = false, onSelect, title, detail, detailIcon, detailTitle,
  starred = false, starLabel, onStar, starActionLabel, starPending = false, starDisabled = false, onRename, renameLabel, onExport, exportLabel,
}: PickerRowProps) {
  const canStar = !starred && !!onStar;
  const canRename = current && !!onRename;
  const canExport = current && !!onExport;
  return (
    <CommandItem value={value} keywords={keywords} aria-current={current ? 'true' : undefined} data-current={current || undefined}
      className={cn(
        'group gap-2 py-1 pr-1.5 data-[current=true]:font-medium [@media(pointer:coarse)]:min-h-11',
      )}
      onSelect={onSelect}>
      <Check className={cn('h-4 w-4 shrink-0', current ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span title={title} className="min-w-0 truncate text-sm leading-[18px]">{title}</span>
        {detail && (
          <span className="flex min-w-0 items-center gap-1 text-xs font-normal leading-4 text-muted-foreground" title={detailTitle}>
            {detailIcon}
            <span className="truncate">{detail}</span>
          </span>
        )}
      </span>
      {(starred || canStar || canRename || canExport) && (
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          {starred ? (
            <StarMark label={starLabel ?? 'Starred'} className="h-6 w-6" />
          ) : canStar && (
            <button type="button" aria-label={starActionLabel} title={starActionLabel} disabled={starDisabled}
              className={cn(ROW_BUTTON, starPending ? 'opacity-100' : REVEAL)}
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); onStar(); }}>
              <Star className={cn('h-3.5 w-3.5', starPending && 'animate-pulse fill-current')} aria-hidden="true" />
            </button>
          )}
          {canRename && (
            <button type="button" aria-label={renameLabel} title={renameLabel} className={cn(ROW_BUTTON, REVEAL)}
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRename(); }}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          {canExport && (
            <button type="button" aria-label={exportLabel ?? 'Export timeline'} title="Export as .astrid file" className={cn(ROW_BUTTON, REVEAL)}
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); onExport(); }}>
              <FileOutput className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </span>
      )}
    </CommandItem>
  );
}

/** An action pinned under the list, with its icon in the tick column. */
export function PickerFooterAction({ icon: Icon, children, onClick, disabled }: { icon: LucideIcon; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className="flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [@media(pointer:coarse)]:min-h-11">
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </button>
  );
}

/** Renames one item (`target` is null while closed): trims, rejects empty and over-long names, and keeps the dialog open on failure. */
export function RenameDialog({ noun, target, onClose, onRename }: {
  /** e.g. "chat" or "timeline". */
  noun: string;
  target: { id: string; label: string } | null;
  onClose: () => void;
  onRename: (id: string, name: string) => Promise<unknown>;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const errorId = useId();
  const capitalNoun = noun.charAt(0).toUpperCase() + noun.slice(1);
  // Each opening starts from the item's current name, before the input focuses and selects it.
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if ((target?.id ?? null) !== openedFor) {
    setOpenedFor(target?.id ?? null);
    if (target) { setValue(target.label); setError(null); }
  }

  return (
    <Dialog open={!!target} onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const name = value.trim();
            if (!name) { setError(`Enter a ${noun} name.`); return; }
            if (name.length > 120) { setError(`${capitalNoun} names must be 120 characters or fewer.`); return; }
            if (!target) return;
            setPending(true);
            setError(null);
            try {
              await onRename(target.id, name);
              onClose();
            } catch (cause) {
              toast.error(cause instanceof Error ? cause.message : `Could not rename ${noun}.`);
            } finally {
              setPending(false);
            }
          }}
        >
          <DialogHeader><DialogTitle>Rename {noun}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Input
              autoFocus
              aria-label={`${capitalNoun} name`}
              value={value}
              maxLength={121}
              onFocus={(event) => event.currentTarget.select()}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => { setValue(event.target.value); setError(null); }}
              disabled={pending}
            />
            {error && <p id={errorId} className="text-sm text-destructive" role="alert">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
