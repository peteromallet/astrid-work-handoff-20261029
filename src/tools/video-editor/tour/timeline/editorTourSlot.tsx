import { useSyncExternalStore, type ComponentType } from 'react';
import { useEditorTourRunning } from '@/shared/state/editorTourStore.ts';

// The overlay is registered by the runner (any module that loads with it) and rendered by `EditorTourSlot`.
let overlay: ComponentType | null = null;
const listeners = new Set<() => void>();

export function registerEditorTourOverlay(component: ComponentType | null): void {
  if (overlay === component) return;
  overlay = component;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The mount slot for the tour's overlay (spotlight, shield, card, runner).
 *
 * T6's API, in full:
 * - `registerEditorTourOverlay(Component)` (this module) once, before or after `startEditorTour()`.
 *   Registering later (for example from a lazily loaded runner chunk) is fine: the slot re-renders.
 *   `registerEditorTourOverlay(null)` clears it.
 * - `VideoEditorPage` renders `<EditorTourSlot />` as the last child of its root element, outside the
 *   editor provider, only while `useEditorTourRunning()` is true, so `Component` mounts on
 *   `startEditorTour()` and unmounts on `exitEditorTour()`. It takes no props.
 * - Because it sits outside the editor provider it cannot use the timeline store hooks. Read the tour
 *   store and the DOM anchors (`tour/anchors.ts`) instead.
 * - The demo timeline, its rows and its playback are driven by `EditorTourTimelineDriver` from the
 *   store's `act`/`beat`; it sets `ready.timeline` once the beat is presented. Nothing else to wire.
 */
export function EditorTourSlot() {
  const running = useEditorTourRunning();
  const Overlay = useSyncExternalStore(subscribe, () => overlay, () => null);
  return running && Overlay ? <Overlay /> : null;
}
