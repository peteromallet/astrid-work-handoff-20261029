import loopUrl from './astrid-minks-loop.webp';
import stillUrl from './astrid-minks-still.png';

/** The original transparent circle loop, sized for the home loading mark. */
export function MinkCircle({ reducedMotion, size = 96 }: { reducedMotion: boolean; size?: number }) {
  return <img
    data-astrid-mink-circle
    src={reducedMotion ? stillUrl : loopUrl}
    width={size}
    height={size}
    alt=""
    aria-hidden="true"
    decoding="async"
    style={{ imageRendering: 'pixelated' }}
  />;
}
