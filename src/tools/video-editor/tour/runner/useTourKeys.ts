import { useEffect } from 'react';
import { backEditorTour, finishEditorTour, runEditorTourPrimary } from './tourBeats';

/**
 * While the tour runs, one capture-phase listener owns the keyboard: Enter is the primary action,
 * ArrowLeft goes back, Esc skips the tour, and every other key is swallowed so timeline and chat shortcuts stay quiet.
 * Browser chords (Cmd/Ctrl) keep their default action, such as reload, but never reach the app.
 */
export function useTourKeys(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      event.stopImmediatePropagation();
      if (event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      if (event.repeat) return;
      if (event.key === 'Enter') runEditorTourPrimary();
      else if (event.key === 'ArrowLeft') backEditorTour();
      else if (event.key === 'Escape') finishEditorTour();
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [active]);
}
