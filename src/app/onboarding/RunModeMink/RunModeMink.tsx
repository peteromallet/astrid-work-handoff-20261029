import { useSyncExternalStore } from 'react';
import { cn } from '@/shared/components/ui/contracts/cn.ts';
import './RunModeMink.css';

export type RunModeMinkScene = 'beach' | 'desk';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches;
}

/**
 * The mink beside a run-mode option: on the beach with a laptop and a drink (astrid.haus), or at a desk in
 * glasses (on your computer). Decorative: the option's own text says what it means. The chosen option's mink
 * moves, and so does an option's mink while the pointer hovers over that option (CSS, fine pointers only). None
 * moves when the person asks for reduced motion; a still frame shows instead.
 */
export function RunModeMink({ scene, active, className }: { readonly scene: RunModeMinkScene; readonly active: boolean; readonly className?: string }) {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => true);
  return <span
    aria-hidden="true"
    data-scene={scene}
    data-motion={active && !reducedMotion ? 'play' : 'still'}
    className={cn('run-mode-mink', !active && 'opacity-70 saturate-[.55]', className)}
  />;
}
