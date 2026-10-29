import { useSyncExternalStore } from 'react';

/**
 * Whether the page on screen hosts the app panes' entry points itself.
 *
 * The app's pane-control tabs (`PaneControlTab`: the Tasks/chat rail at the
 * right edge, the gallery pair at the bottom) float over whatever the page
 * draws. A page whose own layout carries those entry points (the video editor
 * on a phone, whose bottom bar opens chat and the gallery) acquires this while
 * it is mounted, and the floating tabs step aside. The page opens the panes
 * with the `openAgentComposer` and `openGenerationsPane` app events. While it
 * is hosted, every pane is transient on any device: it never locks or pushes the
 * page, it draws a backdrop, and a tap outside closes it (`useSlidingPane`,
 * `usePaneLockPolicyState`, `LayoutMainContent`).
 */
type Listener = () => void;

let hostCount = 0;
const listeners = new Set<Listener>();

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

function getSnapshot(): boolean {
  return hostCount > 0;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Marks the pane entry points as hosted by the page; call the returned function to release. */
export function acquirePaneControlsHost(): () => void {
  hostCount += 1;
  notifyListeners();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    hostCount = Math.max(0, hostCount - 1);
    notifyListeners();
  };
}

export function usePaneControlsHosted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
