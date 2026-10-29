// Shared control chrome and small formatters for the World Explorer. Same look as the Transcript panel;
// pack TSX is compiled by the app's Tailwind scan, but keep layout-critical sizes inline.
export const button = 'min-h-10 sm:min-h-8 rounded-md px-2 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
export const select = 'min-h-10 sm:min-h-8 min-w-0 max-w-full appearance-none rounded-md border border-border/70 bg-transparent py-0 pl-2 pr-6 text-xs text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
export const chip = 'h-7 rounded-full border border-border/70 px-2 text-[11px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
/** An event in the docked grid: fills its cell, name left (truncated), time right. */
export const eventChip = 'flex h-7 w-full min-w-0 items-center justify-between gap-2 rounded-full border border-border/70 px-3 text-[11px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
/** An event in the full-screen side column: a list row. */
export const eventRow = 'flex min-h-8 w-full min-w-0 items-center justify-between gap-2 rounded-md px-2 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
export const VIEWER_STYLE = { background: '#05060f' } as const;
export const OVERLAY_STYLE = { background: 'rgba(5, 6, 15, 0.92)', color: 'rgba(255, 255, 255, 0.72)' } as const;
export const ERROR_STYLE = { color: 'hsl(var(--destructive))' } as const;
/** Quiet pill laid over the viewer. */
export const PILL_STYLE = { background: 'rgba(5, 6, 15, 0.62)', color: 'rgba(255, 255, 255, 0.82)' } as const;

/** m:ss, or m:ss.s with one decimal. Rounds on the displayed unit so 59.96 never reads 0:60.0. */
export function clockText(seconds: number, decimals = 0): string {
  const unit = decimals ? 10 : 1;
  const ticks = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * unit));
  const minutes = Math.floor(ticks / (60 * unit));
  const rest = ticks - minutes * 60 * unit;
  const whole = String(Math.floor(rest / unit)).padStart(2, '0');
  return `${minutes}:${whole}${decimals ? `.${rest % unit}` : ''}`;
}

export const speedLabel = (speed: number) => `${speed}×`;
export const errorMessage = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));
