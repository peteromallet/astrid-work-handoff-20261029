import type { SpotlightRect } from './useSpotlightRects';

const GAP = 16;
const EDGE = 16;

export interface CardPosition {
  left: number;
  top: number;
}

export interface CardPlacementOptions {
  /** Space kept between the card and the viewport's edges. */
  edge?: number;
  /** Space kept between the card and the spotlit area it sits beside. */
  gap?: number;
  /** Take the spot below the spotlit area whenever it fits, before the roomiest side (the chat's reply: the card stays in its panel). */
  preferBelow?: boolean;
}

function overlapArea(position: CardPosition, card: { width: number; height: number }, rects: readonly SpotlightRect[]): number {
  return rects.reduce((total, r) => {
    const width = Math.min(position.left + card.width, r.x + r.width) - Math.max(position.left, r.x);
    const height = Math.min(position.top + card.height, r.y + r.height) - Math.max(position.top, r.y);
    return total + (width > 0 && height > 0 ? width * height : 0);
  }, 0);
}

/**
 * Where the card goes: beside the spotlighted area on whichever side leaves the most room (right,
 * left, below, above), clamped to the viewport; in the middle of the screen when nothing is
 * spotlighted. When no side of the whole area fits the card, it takes the spot beside a single target,
 * or along an edge, that covers the least of the targets (bottom-right first).
 */
export function placeCard(
  rects: readonly SpotlightRect[],
  card: { width: number; height: number },
  viewport: { width: number; height: number },
  { edge = EDGE, gap = GAP, preferBelow = false }: CardPlacementOptions = {},
): CardPosition {
  const clamp = (value: number, size: number, limit: number) => Math.max(edge, Math.min(value, limit - size - edge));
  const at = (left: number, top: number): CardPosition => ({ left: clamp(left, card.width, viewport.width), top: clamp(top, card.height, viewport.height) });
  if (rects.length === 0) return { left: (viewport.width - card.width) / 2, top: (viewport.height - card.height) / 2 };
  const sidesOf = (area: readonly SpotlightRect[]) => {
    const left = Math.min(...area.map((r) => r.x));
    const top = Math.min(...area.map((r) => r.y));
    const right = Math.max(...area.map((r) => r.x + r.width));
    const lower = Math.max(...area.map((r) => r.y + r.height));
    const midX = (left + right) / 2 - card.width / 2;
    const midY = (top + lower) / 2 - card.height / 2;
    return [
      { room: viewport.width - right - gap - edge, need: card.width, left: right + gap, top: midY },
      { room: left - gap - edge, need: card.width, left: left - gap - card.width, top: midY },
      { room: viewport.height - lower - gap - edge, need: card.height, left: midX, top: lower + gap },
      { room: top - gap - edge, need: card.height, left: midX, top: top - gap - card.height },
    ];
  };

  const sides = sidesOf(rects);
  const below = sides[2];
  const fitting = preferBelow && below.room >= below.need ? below : sides.filter((side) => side.room >= side.need).sort((a, b) => b.room - a.room)[0];
  if (fitting) return at(fitting.left, fitting.top);

  const candidates = [at(viewport.width, viewport.height), ...rects.flatMap((rect) => sidesOf([rect]).map((side) => at(side.left, side.top))), at(edge, viewport.height), at(viewport.width, edge), at(edge, edge)];
  return candidates.reduce((best, candidate) => (overlapArea(candidate, card, rects) < overlapArea(best, card, rects) ? candidate : best));
}
