import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  useKeyboardShortcuts,
  normalizeKeyboardEvent,
  isActivatableTarget,
} from '@/tools/video-editor/hooks/useKeyboardShortcuts.ts';
import {
  VideoEditorRuntimeContext,
  type VideoEditorRuntimeContextValue,
} from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import {
  createCommandRegistry,
  type CommandRegistry,
} from '@/tools/video-editor/runtime/commandRegistry.ts';
import type { AstridExtension } from '@astrid/editor-sdk';

function makeExtension(id = 'shortcut.ext'): AstridExtension {
  return {
    manifest: {
      id,
      version: '1.0.0',
      label: 'Shortcut Extension',
      contributes: [],
    },
  } as AstridExtension;
}

function makeOptions(overrides: Partial<Parameters<typeof useKeyboardShortcuts>[0]> = {}) {
  return {
    hasSelectedClip: false,
    canMoveSelectedClipToTrack: false,
    selectedClipIds: new Set<string>(),
    moveSelectedClipsToTrack: vi.fn(),
    nudgeSelectedClipsInTime: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    selectAllClips: vi.fn(),
    togglePlayPause: vi.fn(),
    toggleFullscreen: vi.fn(),
    seekRelative: vi.fn(),
    toggleMute: vi.fn(),
    splitSelectedClip: vi.fn(),
    deleteSelectedClip: vi.fn(),
    clearSelection: vi.fn(),
    ...overrides,
  };
}

function mountShortcuts({
  registry,
  extensions = [makeExtension()],
  options = makeOptions(),
}: {
  registry?: CommandRegistry;
  extensions?: readonly AstridExtension[];
  options?: Parameters<typeof useKeyboardShortcuts>[0];
}) {
  const runtime = {
    commandRegistry: registry,
    extensionRuntime: { extensions },
  } as VideoEditorRuntimeContextValue;

  return renderHook(() => useKeyboardShortcuts(options), {
    wrapper: ({ children }) => (
      <VideoEditorRuntimeContext.Provider value={runtime}>
        {children}
      </VideoEditorRuntimeContext.Provider>
    ),
  });
}

function registerShortcutCommand({
  registry,
  extensionId = 'shortcut.ext',
  commandId = 'shortcut.ext.run',
  key = 'CtrlOrCmd+K',
  when,
  handler = vi.fn(),
}: {
  registry: CommandRegistry;
  extensionId?: string;
  commandId?: string;
  key?: string;
  when?: string;
  handler?: ReturnType<typeof vi.fn>;
}) {
  registry.ingestCommandContribution(extensionId, {
    kind: 'command',
    command: commandId,
    label: 'Run command',
  });
  registry.ingestKeybindingContribution(extensionId, {
    kind: 'keybinding',
    command: commandId,
    key,
    ...(when ? { when } : {}),
  });
  registry.registerCommand(extensionId, commandId, handler);
  return handler;
}

function dispatchKey(target: EventTarget, init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('normalizeKeyboardEvent', () => {
  it('normalizes keyboard events into registry keybinding notation', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'K',
      ctrlKey: true,
      shiftKey: true,
    });

    expect(normalizeKeyboardEvent(event)).toBe('ctrlOrCmd+shift+k');
  });

  it('returns null for pure modifier keys', () => {
    const event = new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true });

    expect(normalizeKeyboardEvent(event)).toBeNull();
  });
});

describe('useKeyboardShortcuts modifier gating', () => {
  const selection = { hasSelectedClip: true, canMoveSelectedClipToTrack: true, selectedClipIds: new Set(['clip-1']) };

  it.each([
    ['metaKey'],
    ['ctrlKey'],
    ['altKey'],
  ])('does not split, mute, delete, play or move tracks with %s held', (modifier) => {
    const options = makeOptions(selection);
    mountShortcuts({ options });

    for (const init of [{ key: 's' }, { key: 'm' }, { key: 'Backspace' }, { key: 'Delete' }, { key: ' ', code: 'Space' }, { key: 'ArrowUp' }, { key: 'ArrowDown' }]) {
      dispatchKey(window, { ...init, [modifier]: true });
    }

    expect(options.splitSelectedClip).not.toHaveBeenCalled();
    expect(options.toggleMute).not.toHaveBeenCalled();
    expect(options.deleteSelectedClip).not.toHaveBeenCalled();
    expect(options.togglePlayPause).not.toHaveBeenCalled();
    expect(options.moveSelectedClipsToTrack).not.toHaveBeenCalled();
  });

  it('still fires the plain single-key shortcuts', () => {
    const options = makeOptions(selection);
    mountShortcuts({ options });

    dispatchKey(window, { key: 's' });
    dispatchKey(window, { key: 'm' });
    dispatchKey(window, { key: 'Backspace' });

    expect(options.splitSelectedClip).toHaveBeenCalledTimes(1);
    expect(options.toggleMute).toHaveBeenCalledTimes(1);
    expect(options.deleteSelectedClip).toHaveBeenCalledTimes(1);
  });

  it('toggles preview fullscreen on plain F', () => {
    const options = makeOptions();
    mountShortcuts({ options });

    dispatchKey(window, { key: 'f' });

    expect(options.toggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it('leaves Space, Delete and F alone while the preview is fullscreen', () => {
    const options = makeOptions({ hasSelectedClip: true });
    const fullscreenPreview = document.createElement('div');
    fullscreenPreview.setAttribute('data-preview-fullscreen', 'window');
    document.body.append(fullscreenPreview);

    try {
      mountShortcuts({ options });

      dispatchKey(window, { key: ' ', code: 'Space' });
      dispatchKey(window, { key: 'Delete' });
      dispatchKey(window, { key: 'f' });

      expect(options.togglePlayPause).not.toHaveBeenCalled();
      expect(options.deleteSelectedClip).not.toHaveBeenCalled();
      expect(options.toggleFullscreen).not.toHaveBeenCalled();
    } finally {
      fullscreenPreview.remove();
    }
  });
});

describe('useKeyboardShortcuts time-axis nudge', () => {
  const selection = { hasSelectedClip: true, selectedClipIds: new Set(['clip-1']) };

  it('nudges by the coarse step, and leftwards on ArrowLeft', () => {
    const nudgeSelectedClipsInTime = vi.fn();

    mountShortcuts({
      options: makeOptions({ ...selection, nudgeSelectedClipsInTime }),
    });

    dispatchKey(window, { key: 'ArrowRight', altKey: true });
    dispatchKey(window, { key: 'ArrowLeft', altKey: true });

    expect(nudgeSelectedClipsInTime.mock.calls.map((call) => call[0])).toEqual([0.5, -0.5]);
  });

  it('seeks a whole second on Alt+Arrow when nothing is selected', () => {
    const nudgeSelectedClipsInTime = vi.fn();
    const seekRelative = vi.fn();

    mountShortcuts({
      options: makeOptions({
        hasSelectedClip: false,
        nudgeSelectedClipsInTime,
        seekRelative,
      }),
    });

    dispatchKey(window, { key: 'ArrowRight', altKey: true });

    expect(nudgeSelectedClipsInTime).not.toHaveBeenCalled();
    expect(seekRelative).toHaveBeenCalledTimes(1);
    expect(seekRelative).toHaveBeenCalledWith(1);
  });

  it('leaves the unmodified arrows seeking the playhead', () => {
    const nudgeSelectedClipsInTime = vi.fn();
    const seekRelative = vi.fn();

    mountShortcuts({ options: makeOptions({ ...selection, nudgeSelectedClipsInTime, seekRelative }) });

    dispatchKey(window, { key: 'ArrowRight' });

    expect(nudgeSelectedClipsInTime).not.toHaveBeenCalled();
    expect(seekRelative).toHaveBeenCalledWith(1);
  });

  it('ignores the nudge while typing in an input', () => {
    const nudgeSelectedClipsInTime = vi.fn();
    const input = document.createElement('input');
    document.body.appendChild(input);

    try {
      mountShortcuts({ options: makeOptions({ ...selection, nudgeSelectedClipsInTime }) });

      const event = dispatchKey(input, { key: 'ArrowRight', altKey: true });

      expect(event.defaultPrevented).toBe(false);
      expect(nudgeSelectedClipsInTime).not.toHaveBeenCalled();
    } finally {
      input.remove();
    }
  });
});

describe('useKeyboardShortcuts panel-handled keys', () => {
  it('leaves Space alone when a panel already called preventDefault on it', () => {
    const togglePlayPause = vi.fn();
    const button = document.createElement('button');
    button.addEventListener('keydown', (event) => event.preventDefault());
    document.body.appendChild(button);

    try {
      mountShortcuts({ options: makeOptions({ togglePlayPause }) });

      const event = dispatchKey(button, { key: ' ', code: 'Space' });

      expect(event.defaultPrevented).toBe(true);
      expect(togglePlayPause).not.toHaveBeenCalled();
    } finally {
      button.remove();
    }
  });

  it('still toggles playback on Space when no panel handled it', () => {
    const togglePlayPause = vi.fn();

    mountShortcuts({ options: makeOptions({ togglePlayPause }) });

    dispatchKey(window, { key: ' ', code: 'Space' });

    expect(togglePlayPause).toHaveBeenCalledTimes(1);
  });

  it('still seeks on ArrowRight when no panel handled it', () => {
    const seekRelative = vi.fn();

    mountShortcuts({ options: makeOptions({ seekRelative }) });

    dispatchKey(window, { key: 'ArrowRight' });

    expect(seekRelative).toHaveBeenCalledWith(1);
  });
});

describe('useKeyboardShortcuts extension keybindings', () => {
  it('invokes a matching extension command once after built-ins decline', async () => {
    const registry = createCommandRegistry();
    const handler = registerShortcutCommand({ registry });
    const undo = vi.fn();

    mountShortcuts({ registry, options: makeOptions({ undo }) });

    const event = dispatchKey(window, { key: 'k', ctrlKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(undo).not.toHaveBeenCalled();
    await waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
  });

  it('keeps built-in shortcuts ahead of extension keybinding dispatch', async () => {
    const registry = createCommandRegistry();
    const handler = registerShortcutCommand({
      registry,
      commandId: 'shortcut.ext.other',
      key: 'CtrlOrCmd+K',
    });
    const undo = vi.fn();

    mountShortcuts({ registry, options: makeOptions({ undo }) });

    dispatchKey(window, { key: 'z', ctrlKey: true });

    expect(undo).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(handler).not.toHaveBeenCalled();
  });

  it('skips extension keybindings from editable targets', async () => {
    const registry = createCommandRegistry();
    const handler = registerShortcutCommand({ registry });
    const input = document.createElement('input');
    document.body.appendChild(input);

    try {
      mountShortcuts({ registry });

      const event = dispatchKey(input, { key: 'k', ctrlKey: true });

      expect(event.defaultPrevented).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(handler).not.toHaveBeenCalled();
    } finally {
      input.remove();
    }
  });

  it('reserves CtrlOrCmd+Shift+P for the command palette path', async () => {
    const registry = createCommandRegistry();
    const handler = registerShortcutCommand({
      registry,
      commandId: 'shortcut.ext.palette',
      key: 'CtrlOrCmd+Shift+P',
    });

    mountShortcuts({ registry });

    const event = dispatchKey(window, { key: 'p', ctrlKey: true, shiftKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(registry.diagnostics.some((d) => d.code === 'command-registry/reserved-keybinding')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(handler).not.toHaveBeenCalled();
  });

  it('surfaces invalid extension keybindings through registry diagnostics and skips invocation', async () => {
    const registry = createCommandRegistry();
    const handler = registerShortcutCommand({
      registry,
      key: 'Ctrl++K',
    });

    mountShortcuts({ registry });

    dispatchKey(window, { key: 'k', ctrlKey: true });

    expect(registry.diagnostics.some((d) => d.code === 'command-registry/invalid-keybinding')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps first-registered extension keybinding winner and diagnoses duplicates', async () => {
    const registry = createCommandRegistry();
    const firstHandler = registerShortcutCommand({
      registry,
      extensionId: 'shortcut.ext',
      commandId: 'shortcut.ext.first',
      key: 'CtrlOrCmd+K',
    });
    const secondHandler = registerShortcutCommand({
      registry,
      extensionId: 'shortcut.second',
      commandId: 'shortcut.second.run',
      key: 'CtrlOrCmd+K',
    });

    mountShortcuts({
      registry,
      extensions: [makeExtension('shortcut.ext'), makeExtension('shortcut.second')],
    });

    const event = dispatchKey(window, { key: 'k', ctrlKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(registry.diagnostics.some((d) => d.code === 'command-registry/keybinding-conflict')).toBe(true);
    await waitFor(() => expect(firstHandler).toHaveBeenCalledTimes(1));
    expect(secondHandler).not.toHaveBeenCalled();
  });

  it('honors when predicates against the current selection target', async () => {
    const registry = createCommandRegistry();
    const clipHandler = registerShortcutCommand({
      registry,
      commandId: 'shortcut.ext.clip',
      key: 'CtrlOrCmd+K',
      when: 'target.target == "clip" && target.clipId == "clip-1"',
    });

    mountShortcuts({
      registry,
      options: makeOptions({
        hasSelectedClip: true,
        selectedClipIds: new Set(['clip-1']),
      }),
    });

    dispatchKey(window, { key: 'k', ctrlKey: true });

    await waitFor(() => expect(clipHandler).toHaveBeenCalledTimes(1));
  });

  it('does not invoke when predicates that decline', async () => {
    const registry = createCommandRegistry();
    const handler = registerShortcutCommand({
      registry,
      when: 'target.target == "clip-selection"',
    });

    mountShortcuts({
      registry,
      options: makeOptions({
        hasSelectedClip: true,
        selectedClipIds: new Set(['clip-1']),
      }),
    });

    const event = dispatchKey(window, { key: 'k', ctrlKey: true });

    expect(event.defaultPrevented).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('concurrent editor keyboard ownership', () => {
  it('executes built-in and extension commands only in the event target instance', async () => {
    const full = document.createElement('section');
    const dialog = document.createElement('section');
    const fullButton = document.createElement('button'); full.append(fullButton);
    const dialogButton = document.createElement('button'); dialog.append(dialogButton);
    document.body.append(full, dialog);
    const fullOptions = makeOptions(); const dialogOptions = makeOptions();
    const fullRegistry = createCommandRegistry(); const dialogRegistry = createCommandRegistry();
    const fullCommand = vi.fn(); const dialogCommand = vi.fn();
    registerShortcutCommand({ registry: fullRegistry, handler: fullCommand });
    registerShortcutCommand({ registry: dialogRegistry, handler: dialogCommand });
    const wrapper = (root: HTMLElement, registry: CommandRegistry) => ({ children }: { children: React.ReactNode }) => (
      <VideoEditorRuntimeContext.Provider value={{ shellRootRef: { current: root }, commandRegistry: registry,
        extensionRuntime: { extensions: [makeExtension()] } } as VideoEditorRuntimeContextValue}>{children}</VideoEditorRuntimeContext.Provider>
    );
    const fullView = renderHook(() => useKeyboardShortcuts(fullOptions), { wrapper: wrapper(full, fullRegistry) });
    const dialogView = renderHook(() => useKeyboardShortcuts(dialogOptions), { wrapper: wrapper(dialog, dialogRegistry) });
    dialogButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    expect(dialogOptions.undo).toHaveBeenCalledOnce(); expect(fullOptions.undo).not.toHaveBeenCalled();
    fullButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    await waitFor(() => expect(fullCommand).toHaveBeenCalledOnce()); expect(dialogCommand).not.toHaveBeenCalled();
    dialogView.unmount();
    fullButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    expect(fullOptions.undo).toHaveBeenCalledOnce();
    fullView.unmount(); full.remove(); dialog.remove();
  });
});

const ACTIVATABLE_CASES: Array<[string, () => HTMLElement]> = [
  ['button', () => document.createElement('button')],
  ['[role=button]', () => { const el = document.createElement('div'); el.setAttribute('role', 'button'); return el; }],
  ['a[href]', () => { const el = document.createElement('a'); el.setAttribute('href', '#x'); return el; }],
  ['summary', () => document.createElement('summary')],
  ['[role=checkbox]', () => { const el = document.createElement('div'); el.setAttribute('role', 'checkbox'); return el; }],
  ['[role=switch]', () => { const el = document.createElement('button'); el.setAttribute('role', 'switch'); return el; }],
  ['[role=radio]', () => { const el = document.createElement('div'); el.setAttribute('role', 'radio'); return el; }],
  ['[role=tab]', () => { const el = document.createElement('div'); el.setAttribute('role', 'tab'); return el; }],
  ['[role=slider]', () => { const el = document.createElement('div'); el.setAttribute('role', 'slider'); return el; }],
];

describe('useKeyboardShortcuts activatable targets', () => {
  it.each(ACTIVATABLE_CASES)('leaves Space to a focused %s', (_name, make) => {
    const togglePlayPause = vi.fn();
    const el = make();
    el.tabIndex = 0;
    document.body.appendChild(el);
    try {
      mountShortcuts({ options: makeOptions({ togglePlayPause }) });
      el.focus();
      const event = dispatchKey(el, { key: ' ', code: 'Space' });
      expect(event.defaultPrevented).toBe(false);
      expect(togglePlayPause).not.toHaveBeenCalled();
    } finally {
      el.remove();
    }
  });

  it('leaves Space to a child nested inside an activatable control', () => {
    const togglePlayPause = vi.fn();
    const button = document.createElement('button');
    const inner = document.createElement('span');
    button.append(inner);
    document.body.appendChild(button);
    try {
      mountShortcuts({ options: makeOptions({ togglePlayPause }) });
      const event = dispatchKey(inner, { key: ' ', code: 'Space' });
      expect(event.defaultPrevented).toBe(false);
      expect(togglePlayPause).not.toHaveBeenCalled();
    } finally {
      button.remove();
    }
  });

  it.each(ACTIVATABLE_CASES)('leaves Enter to a focused %s (no extension Enter binding runs)', async (_name, make) => {
    const registry = createCommandRegistry();
    const handler = registerShortcutCommand({ registry, key: 'Enter' });
    const el = make();
    el.tabIndex = 0;
    document.body.appendChild(el);
    try {
      mountShortcuts({ registry });
      el.focus();
      const event = dispatchKey(el, { key: 'Enter', code: 'Enter' });
      expect(event.defaultPrevented).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(handler).not.toHaveBeenCalled();
    } finally {
      el.remove();
    }
  });

  it('still runs an Enter extension binding on a non-activatable target', async () => {
    const registry = createCommandRegistry();
    const handler = registerShortcutCommand({ registry, key: 'Enter' });
    const div = document.createElement('div');
    document.body.appendChild(div);
    try {
      mountShortcuts({ registry });
      dispatchKey(div, { key: 'Enter', code: 'Enter' });
      await waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    } finally {
      div.remove();
    }
  });

  it('still toggles playback on Space from an empty target', () => {
    const togglePlayPause = vi.fn();
    const div = document.createElement('div');
    document.body.appendChild(div);
    try {
      mountShortcuts({ options: makeOptions({ togglePlayPause }) });
      const event = dispatchKey(div, { key: ' ', code: 'Space' });
      expect(event.defaultPrevented).toBe(true);
      expect(togglePlayPause).toHaveBeenCalledTimes(1);
    } finally {
      div.remove();
    }
  });

  it('still seeks on ArrowRight with a focused button', () => {
    const seekRelative = vi.fn();
    const button = document.createElement('button');
    document.body.appendChild(button);
    try {
      mountShortcuts({ options: makeOptions({ seekRelative }) });
      button.focus();
      dispatchKey(button, { key: 'ArrowRight' });
      expect(seekRelative).toHaveBeenCalledWith(1);
    } finally {
      button.remove();
    }
  });

  it('isActivatableTarget matches controls and rejects plain elements and null', () => {
    const button = document.createElement('button');
    const div = document.createElement('div');
    expect(isActivatableTarget(button)).toBe(true);
    expect(isActivatableTarget(div)).toBe(false);
    expect(isActivatableTarget(null)).toBe(false);
    expect(isActivatableTarget(window)).toBe(false);
  });
});

describe('useKeyboardShortcuts while a panel is full screen', () => {
  it('leaves Escape alone inside a full-screen frame', () => {
    const clearSelection = vi.fn();
    const frame = document.createElement('div');
    frame.setAttribute('data-panel-fullscreen-frame', '');
    const inner = document.createElement('div');
    inner.tabIndex = 0;
    frame.append(inner);
    document.body.appendChild(frame);
    try {
      mountShortcuts({ options: makeOptions({ clearSelection }) });
      const event = dispatchKey(inner, { key: 'Escape' });
      expect(clearSelection).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    } finally {
      frame.remove();
    }
  });

  it('fires no editor shortcut even when focus is outside the frame', () => {
    const clearSelection = vi.fn();
    const frame = document.createElement('div');
    frame.setAttribute('data-panel-fullscreen-frame', '');
    const outside = document.createElement('div');
    document.body.append(frame, outside);
    try {
      mountShortcuts({ options: makeOptions({ clearSelection }) });
      const event = dispatchKey(outside, { key: 'Escape' });
      expect(clearSelection).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    } finally {
      frame.remove();
      outside.remove();
    }
  });

  it('still clears the selection and prevents default on Escape elsewhere', () => {
    const clearSelection = vi.fn();
    const div = document.createElement('div');
    document.body.appendChild(div);
    try {
      mountShortcuts({ options: makeOptions({ clearSelection }) });
      const event = dispatchKey(div, { key: 'Escape' });
      expect(clearSelection).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    } finally {
      div.remove();
    }
  });
});
