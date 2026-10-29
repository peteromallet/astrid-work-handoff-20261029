import type { TimelineDataItemRef } from '@/shared/state/selectionStore.ts';

/** Committed painted plane, scoped to the same canvas node as marquee geometry. */
export interface MarqueePlane {
  readonly layoutKey: string;
  readonly clipIds?: readonly string[];
  readonly dataItems: readonly TimelineDataItemRef[];
}
const planes = new WeakMap<HTMLElement, MarqueePlane>();
export function publishMarqueePlane(node: HTMLElement, plane: MarqueePlane): () => void {
  planes.set(node, plane);
  return () => { if (planes.get(node) === plane) planes.delete(node); };
}
export const getMarqueePlane = (node: HTMLElement): MarqueePlane | undefined => planes.get(node);
