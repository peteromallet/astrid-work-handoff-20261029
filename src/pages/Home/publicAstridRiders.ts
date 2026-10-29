import type { PublicAstridAudience } from './publicAstridMotion';

/**
 * Flat controls that sit above a tilted, moving surface ("riders").
 *
 * One contract for anything layered over a homepage surface:
 *  - position: PublicAstridCallouts samples the host's rendered box on every frame and writes the
 *    rider's box from it (`placeRider`), in both audiences, so the rider is glued to the host for as
 *    long as any journey runs (including a mid-journey reversal);
 *  - visibility: the rider carries `data-astrid-rider="<audience it belongs to>"`; the shell CSS
 *    fades it with the same duration, easing and delay variables the panels use, so it fades out
 *    while travelling away and fades in while travelling back. It is never mounted, unmounted or
 *    display/visibility-toggled at a journey boundary, and prefers-reduced-motion swaps it instantly.
 */
export type RiderBox = { left: number; top: number; width: number; height: number };

export type Rider = {
  /** Selector for the overlay element, searched inside the stage. */
  overlay: string;
  /** Selector for the surface the overlay rides. */
  host: string;
  /** The audience in which the rider is shown (mirrors `data-astrid-rider`). */
  audience: PublicAstridAudience;
  /** Overlay box, in viewport pixels, for a host box. */
  place: (host: RiderBox) => RiderBox;
};

const TRANSPORT_PAD = 10;
const TRANSPORT_MAX_HEIGHT = 78;
const TRANSPORT_HEIGHT_RATIO = 0.24;

/** The transport hugs the bottom edge of the player. */
export function placeTransport(host: RiderBox): RiderBox {
  const height = Math.min(TRANSPORT_MAX_HEIGHT, host.height * TRANSPORT_HEIGHT_RATIO);
  return {
    left: host.left + TRANSPORT_PAD,
    top: host.top + host.height - TRANSPORT_PAD - height,
    width: Math.max(0, host.width - TRANSPORT_PAD * 2),
    height,
  };
}

export const RIDERS: readonly Rider[] = [
  { overlay: '.astrid-preview-transport-outlet', host: '.astrid-player-surface', audience: 'app', place: placeTransport },
];
