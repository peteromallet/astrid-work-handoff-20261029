import { UI_Z_LAYERS } from '@/shared/lib/uiLayers';
import type { SpotlightRect } from './useSpotlightRects';

const MAX_CUTOUTS = 3;
const CORNER_RADIUS = 10;
const MOVE = 'x 420ms cubic-bezier(0.22, 1, 0.36, 1), y 420ms cubic-bezier(0.22, 1, 0.36, 1), width 420ms cubic-bezier(0.22, 1, 0.36, 1), height 420ms cubic-bezier(0.22, 1, 0.36, 1)';

interface TourSpotlightProps {
  rects: readonly SpotlightRect[];
  /** A hole in the input shield (the chat Send button), or null. */
  clickable: SpotlightRect | null;
  reducedMotion: boolean;
}

function holePath(r: SpotlightRect, w: number, h: number): string {
  return `path(evenodd, 'M0 0H${w}V${h}H0Z M${r.x} ${r.y}h${r.width}v${r.height}h${-r.width}Z')`;
}

/**
 * Dims everything except the cutouts and eats pointer input everywhere except `clickable`. Cutout
 * slots are fixed in number so each keeps its identity and glides between targets; unused slots
 * collapse onto the first cutout (or to nothing, which dims the whole page).
 */
export function TourSpotlight({ rects, clickable, reducedMotion }: TourSpotlightProps) {
  const slots = Array.from({ length: MAX_CUTOUTS }, (_, i) => rects[i] ?? rects[0] ?? null);
  const transition = reducedMotion ? 'none' : MOVE;
  const viewport = typeof window === 'undefined' ? { w: 0, h: 0 } : { w: window.innerWidth, h: window.innerHeight };

  return (
    <div
      aria-hidden
      data-editor-tour-shield
      className="fixed inset-0"
      style={{ zIndex: UI_Z_LAYERS.EDITOR_TOUR_SHIELD, ...(clickable ? { clipPath: holePath(clickable, viewport.w, viewport.h) } : {}) }}
    >
      <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="editor-tour-dim">
            <rect width="100%" height="100%" fill="white" />
            {slots.map((rect, i) => (
              <rect
                key={i}
                rx={CORNER_RADIUS}
                fill="black"
                x={rect?.x ?? 0}
                y={rect?.y ?? 0}
                width={rect?.width ?? 0}
                height={rect?.height ?? 0}
                style={{ transition }}
              />
            ))}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgb(0 0 0 / 0.6)" mask="url(#editor-tour-dim)" />
        {/* On a dark page the dimmed edge alone barely shows, so each cutout gets a thin ring there. */}
        {rects.slice(0, MAX_CUTOUTS).map((rect, i) => (
          <rect
            key={i}
            data-editor-tour-ring
            rx={CORNER_RADIUS}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            className="fill-none stroke-transparent dark:stroke-primary/70"
            strokeWidth={1.5}
            style={{ transition }}
          />
        ))}
      </svg>
    </div>
  );
}
