import { useEffect, useContext } from 'react';
import { isEditableTarget } from '@/tools/video-editor/lib/coordinate-utils.ts';
import { COARSE_TIME_NUDGE_SECONDS } from '@/tools/video-editor/lib/keyboard-nudge.ts';
import {
  VideoEditorRuntimeContext,
  type VideoEditorRuntimeContextValue,
} from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import { evaluatePredicate } from '@/tools/video-editor/runtime/commandPredicates.ts';
import type { KeybindingEntry } from '@/tools/video-editor/runtime/commandRegistry.ts';
import type { PredicateContext } from '@/tools/video-editor/runtime/commandPredicates.ts';
import type { AstridExtension } from '@astrid/editor-sdk';
import { PREVIEW_FULLSCREEN_ATTRIBUTE } from '@/tools/video-editor/components/PreviewPanel/usePreviewFullscreen.ts';

// ---------------------------------------------------------------------------
// KeyboardEvent → normalized keybinding notation
// ---------------------------------------------------------------------------

/**
 * Modifier order for canonical keybinding notation (mirrors commandRegistry).
 * Lower numbers sort first. Must match MODIFIER_ORDER in commandRegistry.ts.
 */
const MODIFIER_SORT: Record<string, number> = {
  alt: 0,
  ctrl: 1,
  ctrlOrCmd: 2,
  shift: 3,
};

/** Keys that represent only a modifier press — never a complete keybinding. */
const PURE_MODIFIER_KEYS = new Set([
  'Control', 'Shift', 'Alt', 'Meta',
  'ControlLeft', 'ControlRight',
  'ShiftLeft', 'ShiftRight',
  'AltLeft', 'AltRight',
  'MetaLeft', 'MetaRight',
]);

/** Keys that have no meaningful binding representation. */
const SKIP_KEYS = new Set([
  'Dead', 'Unidentified', 'Process',
]);

/**
 * Convert a KeyboardEvent into a normalized keybinding notation string
 * suitable for looking up in the command registry's keybinding map.
 *
 * Returns null if the event should be ignored (pure modifier, dead key, etc.).
 *
 * Key mappings (event.key → normalized):
 * - ArrowLeft/Right/Up/Down → arrowleft/arrowright/arrowup/arrowdown
 * - Backspace/Delete/Escape/Tab/Enter → backspace/delete/escape/tab/enter
 * - ' ' (Space) → ' '
 * - Single characters → lowercased (a, z, m, s, etc.)
 * - F1–F12 → f1–f12
 *
 * Modifiers (ctrlKey or metaKey → ctrlOrCmd, altKey → alt, shiftKey → shift)
 * are collected, sorted in canonical order, and joined with '+' before the key.
 */
export function normalizeKeyboardEvent(event: KeyboardEvent): string | null {
  // Ignore pure modifier presses
  if (PURE_MODIFIER_KEYS.has(event.key)) return null;

  // Skip keys with no semantic meaning
  if (SKIP_KEYS.has(event.key)) return null;

  // Collect modifiers
  const modifiers: string[] = [];

  // ctrlKey or metaKey → ctrlOrCmd (cross-platform canonical form)
  if (event.ctrlKey || event.metaKey) {
    modifiers.push('ctrlOrCmd');
  }
  if (event.altKey) {
    modifiers.push('alt');
  }
  if (event.shiftKey) {
    modifiers.push('shift');
  }

  // Sort modifiers by canonical order
  modifiers.sort((a, b) => (MODIFIER_SORT[a] ?? 99) - (MODIFIER_SORT[b] ?? 99));

  // Determine the key part
  const rawKey = event.key;
  let keyPart: string;

  if (rawKey.startsWith('Arrow')) {
    // ArrowLeft → arrowleft, etc.
    keyPart = rawKey.toLowerCase();
  } else if (rawKey === 'Backspace' || rawKey === 'Delete' ||
             rawKey === 'Escape' || rawKey === 'Tab' || rawKey === 'Enter') {
    keyPart = rawKey.toLowerCase();
  } else if (rawKey.startsWith('F') && rawKey.length >= 2 && rawKey.length <= 3) {
    // F1–F12
    const num = parseInt(rawKey.slice(1), 10);
    if (num >= 1 && num <= 35) {
      keyPart = rawKey.toLowerCase();
    } else {
      // Unrecognized F-key
      return null;
    }
  } else if (rawKey === ' ') {
    // Space character
    keyPart = ' ';
  } else if (rawKey.length === 1) {
    // Single character keys (letters, numbers, punctuation)
    keyPart = rawKey.toLowerCase();
  } else {
    // Unrecognized key — skip
    return null;
  }

  // Assemble: sorted modifiers + key part
  if (modifiers.length === 0) {
    return keyPart;
  }
  return `${modifiers.join('+')}+${keyPart}`;
}

// ---------------------------------------------------------------------------
// Extension context resolution
// ---------------------------------------------------------------------------

/**
 * Build a PredicateContext for `when` evaluation scoped to a single extension.
 * Returns null if the extension cannot be resolved.
 */
function buildPredicateContext(
  extensionId: string,
  extensions: readonly AstridExtension[],
  selectedClipIds: ReadonlySet<string>,
): PredicateContext | null {
  const ext = extensions.find((e) => e.manifest.id === extensionId);
  if (!ext) return null;

  const selectedIds = [...selectedClipIds];
  const target: PredicateContext['target'] = selectedIds.length === 1
    ? { target: 'clip', clipId: selectedIds[0] }
    : selectedIds.length > 1
      ? { target: 'clip-selection', clipIds: selectedIds }
      : { target: 'timeline-area' };

  return {
    ext: {
      id: ext.manifest.id,
      version: ext.manifest.version,
      label: ext.manifest.label,
    },
    target,
    editor: undefined,
  };
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

interface UseKeyboardShortcutsOptions {
  hasSelectedClip: boolean;
  canMoveSelectedClipToTrack: boolean;
  selectedClipIds: ReadonlySet<string>;
  moveSelectedClipsToTrack: (direction: 'up' | 'down', selectedClipIds: ReadonlySet<string>) => void;
  /** Translate the whole selection along the time axis (Alt+Arrow). */
  nudgeSelectedClipsInTime: (deltaSeconds: number) => void;
  undo: () => void;
  redo: () => void;
  selectAllClips: () => void;
  togglePlayPause: () => void;
  /** F: the preview fills the screen, or comes back. */
  toggleFullscreen: () => void;
  seekRelative: (deltaSeconds: number) => void;
  toggleMute: () => void;
  splitSelectedClip: () => void;
  deleteSelectedClip: () => void;
  clearSelection: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function isEditorKeyboardEvent(event: KeyboardEvent, root: HTMLElement | null): boolean {
  if (!root) return false;
  const target = event.target;
  return target instanceof Node && root.contains(target);
}

/** Controls whose native Space/Enter activation the editor's shortcuts must not take. */
const ACTIVATABLE_TARGET = 'button, [role=button], a[href], summary, [role=checkbox], [role=switch], [role=radio], [role=tab], [role=slider]';

export function isActivatableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(ACTIVATABLE_TARGET) !== null;
}

export function useKeyboardShortcuts({
  hasSelectedClip,
  canMoveSelectedClipToTrack,
  selectedClipIds,
  moveSelectedClipsToTrack,
  nudgeSelectedClipsInTime,
  undo,
  redo,
  selectAllClips,
  togglePlayPause,
  toggleFullscreen,
  seekRelative,
  toggleMute,
  splitSelectedClip,
  deleteSelectedClip,
  clearSelection,
}: UseKeyboardShortcutsOptions) {
  // Use raw context to avoid throwing when outside VideoEditorRuntimeProvider.
  // This is safe: the hook is always mounted inside the provider in production,
  // but test environments that mock the hook at the import level may bypass it.
  const runtime: VideoEditorRuntimeContextValue | null = useContext(VideoEditorRuntimeContext);
  const commandRegistry = runtime?.commandRegistry;
  const extensions = runtime?.extensionRuntime?.extensions ?? [];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (runtime?.shellRootRef && !isEditorKeyboardEvent(event, runtime.shellRootRef.current)) return;
      if (isEditableTarget(event.target)) {
        return;
      }
      // A panel handled this key before it bubbled to window (this listener
      // is bubble-phase, not capture), so leave it to that panel.
      if (event.defaultPrevented) return;
      // Space and Enter belong to a focused button, link, tab or slider (panels and
      // Transcript included); only an unfocused timeline plays on Space.
      if ((event.key === ' ' || event.key === 'Enter') && isActivatableTarget(event.target)) return;

      // A full-screen panel is modal: no editor shortcut acts while it is open, and its Esc
      // (the frame listens after this hook) must not also clear the timeline selection.
      // The fullscreen preview is the same: it has a video player's keys of its own.
      if (document.querySelector(`[data-panel-fullscreen-frame], [${PREVIEW_FULLSCREEN_ATTRIBUTE}]`)) return;

      const isModifierPressed = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      // Single-key shortcuts are plain keys: Cmd/Ctrl/Alt+S, +M, +Backspace, +Space belong to the browser or OS.
      const isPlainKey = !event.metaKey && !event.ctrlKey && !event.altKey;

      // ---- Built-in shortcuts (unchanged) -----------------------------------

      if (isModifierPressed && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }

      if ((isModifierPressed && key === 'z' && event.shiftKey) || (event.ctrlKey && key === 'y')) {
        event.preventDefault();
        redo();
        return;
      }

      // Alt+Arrow is the time axis of the ArrowUp/Down track move: with a
      // selection it nudges the clips; without one it seeks like a plain arrow.
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && event.altKey && hasSelectedClip) {
        event.preventDefault();
        nudgeSelectedClipsInTime(event.key === 'ArrowLeft' ? -COARSE_TIME_NUDGE_SECONDS : COARSE_TIME_NUDGE_SECONDS);
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        seekRelative(-1);
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        seekRelative(1);
        return;
      }

      if (event.key === 'ArrowUp' && hasSelectedClip && isPlainKey) {
        event.preventDefault();
        if (canMoveSelectedClipToTrack) {
          moveSelectedClipsToTrack('up', selectedClipIds);
        }
        return;
      }

      if (event.key === 'ArrowDown' && hasSelectedClip && isPlainKey) {
        event.preventDefault();
        if (canMoveSelectedClipToTrack) {
          moveSelectedClipsToTrack('down', selectedClipIds);
        }
        return;
      }

      if (isModifierPressed && key === 'a') {
        event.preventDefault();
        selectAllClips();
        return;
      }

      if (event.code === 'Space' && isPlainKey) {
        event.preventDefault();
        togglePlayPause();
        return;
      }

      if (key === 'm' && hasSelectedClip && isPlainKey) {
        event.preventDefault();
        toggleMute();
        return;
      }

      if (key === 'f' && isPlainKey && !event.shiftKey) {
        event.preventDefault();
        toggleFullscreen();
        return;
      }

      if (key === 's' && hasSelectedClip && isPlainKey) {
        event.preventDefault();
        splitSelectedClip();
        return;
      }

      if ((event.key === 'Backspace' || event.key === 'Delete') && hasSelectedClip && isPlainKey) {
        event.preventDefault();
        deleteSelectedClip();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        clearSelection();
        return;
      }

      // ---- Extension keybindings (after all built-ins decline) --------------

      if (!commandRegistry) return;

      const normalized = normalizeKeyboardEvent(event);
      if (!normalized) return;

      // CtrlOrCmd+Shift+P is reserved for the command palette.
      // It is already in BUILT_IN_RESERVED_KEYBINDINGS so extensions cannot
      // register it, but protect the palette shortcut here regardless.
      if (normalized === 'ctrlOrCmd+shift+p') return;
      if (normalized === 'ctrl+shift+p') return;

      const kbEntry: KeybindingEntry | undefined = commandRegistry.getKeybinding(normalized);
      if (!kbEntry) return;

      // Evaluate `when` predicate if present
      if (kbEntry.when) {
        const ctx = buildPredicateContext(kbEntry.extensionId, extensions, selectedClipIds);
        if (!ctx) return; // extension not found — cannot evaluate

        const predicateOk = evaluatePredicate(kbEntry.when, ctx);
        if (!predicateOk) return; // predicate declined
      }

      // Invoke the matching extension command exactly once
      event.preventDefault();
      event.stopPropagation();
      void commandRegistry.executeCommand(kbEntry.commandId);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    canMoveSelectedClipToTrack,
    clearSelection,
    commandRegistry,
    deleteSelectedClip,
    extensions,
    hasSelectedClip,
    moveSelectedClipsToTrack,
    nudgeSelectedClipsInTime,
    redo,
    seekRelative,
    selectAllClips,
    selectedClipIds,
    splitSelectedClip,
    runtime?.shellRootRef,
    toggleFullscreen,
    toggleMute,
    togglePlayPause,
    undo,
  ]);
}
