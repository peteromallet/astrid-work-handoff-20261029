import { cn } from '@/shared/components/ui/contracts/cn.ts';

interface PreviewLoadingPlaceholderProps {
  /**
   * Decorative cover over a mounted composition whose first frame is still arriving
   * (FirstFrameCover). It fades out once, when `revealed`.
   */
  readonly cover?: boolean;
  readonly revealed?: boolean;
}

/**
 * The editor's loading surface (card paper with the muted skeleton pulse), at the exact
 * composition bounds. Shared by Remotion's suspense fallback, scoped pack preparation and
 * the first-frame cover.
 */
export function PreviewLoadingPlaceholder({ cover = false, revealed = false }: PreviewLoadingPlaceholderProps = {}) {
  return (
    <div
      {...(cover
        ? { 'aria-hidden': true, 'data-testid': 'preview-first-frame-cover' }
        : { role: 'status', 'aria-live': 'polite' as const, 'aria-label': 'Loading preview', 'data-testid': 'preview-loading-placeholder' })}
      className={cn(
        'pointer-events-none absolute inset-0 bg-card transition-opacity duration-200 ease-out motion-reduce:transition-none',
        revealed && 'opacity-0',
      )}
    >
      <div className={cn('h-full w-full bg-muted/40', !revealed && 'animate-pulse')} />
    </div>
  );
}
