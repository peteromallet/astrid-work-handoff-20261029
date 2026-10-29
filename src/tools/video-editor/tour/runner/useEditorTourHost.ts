import { useEffect } from 'react';
import { registerEditorTourOverlay } from '../timeline/editorTourSlot.tsx';
import { EditorTourRunner } from './EditorTourRunner';

/** Registers explicit editor replays; first-run welcome owns its own browser host. */
export function useEditorTourHost(): void {
  useEffect(() => {
    registerEditorTourOverlay(EditorTourRunner);
    return () => registerEditorTourOverlay(null);
  }, []);
  // First-run welcome now runs before connection; this slot is for explicit replays.
}
