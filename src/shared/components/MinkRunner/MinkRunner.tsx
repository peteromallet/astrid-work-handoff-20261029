import './MinkRunner.css';

/**
 * Astrid's loading mark: the mink running in place over a streaming ground. Decorative only.
 *
 * Every loading mink is 90 CSS pixels wide, independent of display density.
 * `bootSize` opts into the boot-layer handoff by marking it `data-boot-mink-continue`.
 * When the boot layer lifts onto a page that shows this mark (src/app/bootLayer.ts),
 * this one takes over the boot mink's stride in place instead of the two crossfading.
 */
export function MinkRunner({ className = '', bootSize = false }: { className?: string; bootSize?: boolean }) {
  return (
    <div
      className={`astrid-mink-runner ${bootSize ? 'astrid-mink-runner-boot' : ''} ${className}`}
      data-boot-mink-continue={bootSize ? '' : undefined}
      aria-hidden="true"
    >
      <span className="astrid-mink-runner-window"><span className="astrid-mink-runner-sprite" /></span>
      <span className="astrid-mink-runner-ground"><span /></span>
    </div>
  );
}
