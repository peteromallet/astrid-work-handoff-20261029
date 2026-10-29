import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { shallow } from 'zustand/shallow';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { createStore } from 'zustand/vanilla';
import { PANE_CONFIG } from '@/shared/config/panes';
import { usePaneLockPolicyState } from '@/shared/contexts/usePaneLockPolicyState';
import { useLightboxOpenState } from '@/shared/state/lightboxOpenState';

export type PaneLockKey = 'shots' | 'tasks' | 'gens' | 'editor';

export interface PaneLocksState {
  shots: boolean;
  tasks: boolean;
  gens: boolean;
  editor: boolean;
}

export interface PanesStoreAvailability {
  bootstrapped: boolean;
}

export interface PanesStoreState {
  availability: PanesStoreAvailability;
  isGenerationsPaneLocked: boolean;
  setIsGenerationsPaneLocked: (isLocked: boolean) => void;
  isGenerationsPaneOpen: boolean;
  isLightboxOpen: boolean;
  setIsGenerationsPaneOpen: (isOpen: boolean) => void;
  /** Maximum (user-set or default) Generations pane height. */
  generationsPaneHeight: number;
  /** Height the Generations content reports it needs; null when unknown. */
  generationsPaneContentHeight: number | null;
  effectiveGenerationsPaneHeight: number;
  setGenerationsPaneHeight: (height: number) => void;
  setGenerationsPaneContentHeight: (height: number | null) => void;
  isEditorPaneLocked: boolean;
  setIsEditorPaneLocked: (isLocked: boolean) => void;
  isEditorPaneOpen: boolean;
  setIsEditorPaneOpen: (isOpen: boolean) => void;
  editorPaneHeight: number;
  effectiveEditorPaneHeight: number;
  isShotsPaneLocked: boolean;
  setIsShotsPaneLocked: (isLocked: boolean) => void;
  shotsPaneWidth: number;
  setShotsPaneWidth: (width: number) => void;
  isTasksPaneLocked: boolean;
  setIsTasksPaneLocked: (isLocked: boolean) => void;
  tasksPaneWidth: number;
  setTasksPaneWidth: (width: number) => void;
  activeTaskId: string | null;
  setActiveTaskId: (taskId: string | null) => void;
  isTasksPaneOpen: boolean;
  setIsTasksPaneOpen: (isOpen: boolean) => void;
  resetAllPaneLocks: () => void;
  bootstrap: (input: PanesStoreBootstrapInput) => void;
  clearBootstrap: (owner?: symbol) => void;
  resetStore: () => void;
}

interface PanesStoreBootstrapSnapshot {
  viewportHeight: number;
  isLightboxOpen?: boolean;
  locks: PaneLocksState;
  isGenerationsPaneOpen: boolean;
  isEditorPaneOpen: boolean;
  isTasksPaneOpen: boolean;
}

interface PanesStoreBootstrapRuntime {
  setIsGenerationsPaneLocked: (isLocked: boolean) => void;
  setIsEditorPaneLocked: (isLocked: boolean) => void;
  setIsShotsPaneLocked: (isLocked: boolean) => void;
  setIsTasksPaneLocked: (isLocked: boolean) => void;
  setIsGenerationsPaneOpen: (isOpen: boolean) => void;
  setIsEditorPaneOpen: (isOpen: boolean) => void;
  setIsTasksPaneOpen: (isOpen: boolean) => void;
  resetAllPaneLocks: () => void;
}

export interface PanesStoreBootstrapInput extends PanesStoreBootstrapSnapshot, PanesStoreBootstrapRuntime {
  owner: symbol;
}

const MIN_EDITOR_HEIGHT = 200;

let activeBootstrapOwner: symbol | null = null;
let activeBootstrapSnapshot: PanesStoreBootstrapInput | null = null;
let activeBootstrapRuntime: PanesStoreBootstrapRuntime | null = null;

function getViewportHeight(): number {
  if (typeof window === 'undefined') {
    return 0;
  }

  return window.innerHeight;
}

/**
 * The Generations pane height to aim for: its cap, shrunk to the content
 * height when the content reports a smaller one.
 */
export function preferredGenerationsHeight(cap: number, content: number | null): number {
  return content == null ? cap : Math.min(cap, content);
}

function normalizeContentHeight(height: number | null): number | null {
  if (height == null || !Number.isFinite(height) || height <= 0) {
    return null;
  }

  const rounded = Math.round(height);
  return rounded > 0 ? rounded : null;
}

function getEffectivePaneHeights(params: {
  viewportHeight: number;
  idealEditorPaneHeight: number;
  generationsPaneHeight: number;
}) {
  const {
    viewportHeight,
    idealEditorPaneHeight,
    generationsPaneHeight,
  } = params;

  if (idealEditorPaneHeight + generationsPaneHeight <= viewportHeight) {
    return {
      effectiveEditorPaneHeight: idealEditorPaneHeight,
      effectiveGenerationsPaneHeight: generationsPaneHeight,
    };
  }

  if (viewportHeight >= generationsPaneHeight + MIN_EDITOR_HEIGHT) {
    return {
      effectiveEditorPaneHeight: viewportHeight - generationsPaneHeight,
      effectiveGenerationsPaneHeight: generationsPaneHeight,
    };
  }

  const denom = 2 * (idealEditorPaneHeight + generationsPaneHeight) - viewportHeight;
  const effectiveGenerationsPaneHeight = Math.round((viewportHeight * generationsPaneHeight) / denom);

  return {
    effectiveEditorPaneHeight: Math.max(viewportHeight - effectiveGenerationsPaneHeight, 0),
    effectiveGenerationsPaneHeight,
  };
}

function deriveLayout(params: {
  viewportHeight: number;
  isLightboxOpen?: boolean;
  generationsPaneHeight: number;
  generationsPaneContentHeight: number | null;
  isGenerationsPaneLocked: boolean;
  isGenerationsPaneOpen: boolean;
  isEditorPaneLocked: boolean;
  isEditorPaneOpen: boolean;
}) {
  const {
    viewportHeight,
    generationsPaneHeight: generationsPaneCap,
    generationsPaneContentHeight,
    isGenerationsPaneLocked,
    isGenerationsPaneOpen,
    isEditorPaneLocked,
    isEditorPaneOpen,
    isLightboxOpen,
  } = params;

  const editorVisible = isEditorPaneLocked || isEditorPaneOpen;
  const generationsVisible = isGenerationsPaneLocked || isGenerationsPaneOpen;
  const editorPaneHeight = Math.round(viewportHeight * 0.5);
  const preferred = preferredGenerationsHeight(generationsPaneCap, generationsPaneContentHeight);

  // Preserve the preferred gallery height so closing the viewer restores it.
  // Both fixed surfaces use this effective height to meet without overlapping.
  if (isLightboxOpen && generationsVisible) {
    return {
      editorPaneHeight,
      effectiveEditorPaneHeight: editorPaneHeight,
      effectiveGenerationsPaneHeight: Math.min(preferred, PANE_CONFIG.dimensions.LIGHTBOX_GALLERY_HEIGHT),
    };
  }

  // When both panes are LOCKED, split the viewport 50/50 so they meet in the
  // middle instead of leaving a gap when their preferred heights fall short.
  if (isEditorPaneLocked && isGenerationsPaneLocked) {
    return {
      editorPaneHeight,
      effectiveEditorPaneHeight: editorPaneHeight,
      effectiveGenerationsPaneHeight: generationsPaneContentHeight == null
        ? viewportHeight - editorPaneHeight
        : Math.min(viewportHeight - editorPaneHeight, preferred),
    };
  }

  if (!(editorVisible && generationsVisible)) {
    return {
      editorPaneHeight,
      effectiveEditorPaneHeight: editorPaneHeight,
      effectiveGenerationsPaneHeight: preferred,
    };
  }

  const { effectiveEditorPaneHeight, effectiveGenerationsPaneHeight } = getEffectivePaneHeights({
    viewportHeight,
    idealEditorPaneHeight: editorPaneHeight,
    generationsPaneHeight: preferred,
  });

  return {
    editorPaneHeight,
    effectiveEditorPaneHeight,
    effectiveGenerationsPaneHeight,
  };
}

function createInitialSnapshot() {
  const viewportHeight = getViewportHeight();
  const generationsPaneHeight = PANE_CONFIG.dimensions.DEFAULT_HEIGHT;
  const generationsPaneContentHeight = null;
  const layout = deriveLayout({
    viewportHeight,
    generationsPaneHeight,
    generationsPaneContentHeight,
    isGenerationsPaneLocked: false,
    isGenerationsPaneOpen: false,
    isLightboxOpen: false,
    isEditorPaneLocked: false,
    isEditorPaneOpen: false,
  });

  return {
    availability: { bootstrapped: false } as PanesStoreAvailability,
    isGenerationsPaneLocked: false,
    isGenerationsPaneOpen: false,
    isLightboxOpen: false,
    generationsPaneHeight,
    generationsPaneContentHeight,
    effectiveGenerationsPaneHeight: layout.effectiveGenerationsPaneHeight,
    isEditorPaneLocked: false,
    isEditorPaneOpen: false,
    editorPaneHeight: layout.editorPaneHeight,
    effectiveEditorPaneHeight: layout.effectiveEditorPaneHeight,
    isShotsPaneLocked: false,
    shotsPaneWidth: PANE_CONFIG.dimensions.DEFAULT_WIDTH,
    isTasksPaneLocked: false,
    tasksPaneWidth: PANE_CONFIG.dimensions.DEFAULT_WIDTH,
    activeTaskId: null as string | null,
    isTasksPaneOpen: false,
  };
}

function areBootstrapInputsEqual(
  previous: PanesStoreBootstrapInput | null,
  next: PanesStoreBootstrapInput,
): boolean {
  return previous?.owner === next.owner
    && previous.viewportHeight === next.viewportHeight
    && previous.isLightboxOpen === next.isLightboxOpen
    && previous.locks.shots === next.locks.shots
    && previous.locks.tasks === next.locks.tasks
    && previous.locks.gens === next.locks.gens
    && previous.locks.editor === next.locks.editor
    && previous.isGenerationsPaneOpen === next.isGenerationsPaneOpen
    && previous.isEditorPaneOpen === next.isEditorPaneOpen
    && previous.isTasksPaneOpen === next.isTasksPaneOpen;
}

function updateBootstrapRuntime(input: PanesStoreBootstrapInput | null): void {
  if (!input) {
    activeBootstrapRuntime = null;
    return;
  }

  activeBootstrapRuntime = {
    setIsGenerationsPaneLocked: input.setIsGenerationsPaneLocked,
    setIsEditorPaneLocked: input.setIsEditorPaneLocked,
    setIsShotsPaneLocked: input.setIsShotsPaneLocked,
    setIsTasksPaneLocked: input.setIsTasksPaneLocked,
    setIsGenerationsPaneOpen: input.setIsGenerationsPaneOpen,
    setIsEditorPaneOpen: input.setIsEditorPaneOpen,
    setIsTasksPaneOpen: input.setIsTasksPaneOpen,
    resetAllPaneLocks: input.resetAllPaneLocks,
  };
}

function buildBootstrappedState(
  currentState: Pick<
    PanesStoreState,
    | 'generationsPaneHeight'
    | 'generationsPaneContentHeight'
    | 'shotsPaneWidth'
    | 'tasksPaneWidth'
    | 'activeTaskId'
  >,
  input: PanesStoreBootstrapInput,
) {
  const layout = deriveLayout({
    viewportHeight: input.viewportHeight,
    isLightboxOpen: input.isLightboxOpen,
    generationsPaneHeight: currentState.generationsPaneHeight,
    generationsPaneContentHeight: currentState.generationsPaneContentHeight,
    isGenerationsPaneLocked: input.locks.gens,
    isGenerationsPaneOpen: input.isGenerationsPaneOpen,
    isEditorPaneLocked: input.locks.editor,
    isEditorPaneOpen: input.isEditorPaneOpen,
  });

  return {
    availability: { bootstrapped: true } as PanesStoreAvailability,
    isGenerationsPaneLocked: input.locks.gens,
    isGenerationsPaneOpen: input.isGenerationsPaneOpen,
    isLightboxOpen: input.isLightboxOpen ?? false,
    generationsPaneHeight: currentState.generationsPaneHeight,
    generationsPaneContentHeight: currentState.generationsPaneContentHeight,
    effectiveGenerationsPaneHeight: layout.effectiveGenerationsPaneHeight,
    isEditorPaneLocked: input.locks.editor,
    isEditorPaneOpen: input.isEditorPaneOpen,
    editorPaneHeight: layout.editorPaneHeight,
    effectiveEditorPaneHeight: layout.effectiveEditorPaneHeight,
    isShotsPaneLocked: input.locks.shots,
    shotsPaneWidth: currentState.shotsPaneWidth,
    isTasksPaneLocked: input.locks.tasks,
    tasksPaneWidth: currentState.tasksPaneWidth,
    activeTaskId: currentState.activeTaskId,
    isTasksPaneOpen: input.isTasksPaneOpen,
  };
}

function buildStateWithUpdatedGenerationsHeight(
  state: Pick<
    PanesStoreState,
    | 'availability'
    | 'generationsPaneHeight'
    | 'generationsPaneContentHeight'
    | 'shotsPaneWidth'
    | 'tasksPaneWidth'
    | 'activeTaskId'
    | 'isGenerationsPaneLocked'
    | 'isGenerationsPaneOpen'
    | 'isLightboxOpen'
    | 'isEditorPaneLocked'
    | 'isEditorPaneOpen'
    | 'isShotsPaneLocked'
    | 'isTasksPaneLocked'
    | 'isTasksPaneOpen'
  >,
  generationsPaneHeight: number,
  generationsPaneContentHeight: number | null,
) {
  const viewportHeight = activeBootstrapSnapshot?.viewportHeight ?? getViewportHeight();
  const layout = deriveLayout({
    viewportHeight,
    isLightboxOpen: state.isLightboxOpen,
    generationsPaneHeight,
    generationsPaneContentHeight,
    isGenerationsPaneLocked: state.isGenerationsPaneLocked,
    isGenerationsPaneOpen: state.isGenerationsPaneOpen,
    isEditorPaneLocked: state.isEditorPaneLocked,
    isEditorPaneOpen: state.isEditorPaneOpen,
  });

  return {
    availability: state.availability,
    isGenerationsPaneLocked: state.isGenerationsPaneLocked,
    isGenerationsPaneOpen: state.isGenerationsPaneOpen,
    generationsPaneHeight,
    generationsPaneContentHeight,
    effectiveGenerationsPaneHeight: layout.effectiveGenerationsPaneHeight,
    isEditorPaneLocked: state.isEditorPaneLocked,
    isEditorPaneOpen: state.isEditorPaneOpen,
    editorPaneHeight: layout.editorPaneHeight,
    effectiveEditorPaneHeight: layout.effectiveEditorPaneHeight,
    isShotsPaneLocked: state.isShotsPaneLocked,
    shotsPaneWidth: state.shotsPaneWidth,
    isTasksPaneLocked: state.isTasksPaneLocked,
    tasksPaneWidth: state.tasksPaneWidth,
    activeTaskId: state.activeTaskId,
    isTasksPaneOpen: state.isTasksPaneOpen,
  };
}

const initialSnapshot = createInitialSnapshot();

const panesStore = createStore<PanesStoreState>((set) => ({
  ...initialSnapshot,
  setIsGenerationsPaneLocked: (isLocked) => {
    activeBootstrapRuntime?.setIsGenerationsPaneLocked(isLocked);
  },
  setIsGenerationsPaneOpen: (isOpen) => {
    activeBootstrapRuntime?.setIsGenerationsPaneOpen(isOpen);
  },
  setGenerationsPaneHeight: (height) => {
    set((state) => {
      if (state.generationsPaneHeight === height) {
        return state;
      }

      return buildStateWithUpdatedGenerationsHeight(state, height, state.generationsPaneContentHeight);
    });
  },
  setGenerationsPaneContentHeight: (height) => {
    const normalized = normalizeContentHeight(height);
    set((state) => {
      if (state.generationsPaneContentHeight === normalized) {
        return state;
      }

      return buildStateWithUpdatedGenerationsHeight(state, state.generationsPaneHeight, normalized);
    });
  },
  setIsEditorPaneLocked: (isLocked) => {
    activeBootstrapRuntime?.setIsEditorPaneLocked(isLocked);
  },
  setIsEditorPaneOpen: (isOpen) => {
    activeBootstrapRuntime?.setIsEditorPaneOpen(isOpen);
  },
  setIsShotsPaneLocked: (isLocked) => {
    activeBootstrapRuntime?.setIsShotsPaneLocked(isLocked);
  },
  setShotsPaneWidth: (width) => {
    set((state) => (
      state.shotsPaneWidth === width
        ? state
        : { shotsPaneWidth: width }
    ));
  },
  setIsTasksPaneLocked: (isLocked) => {
    activeBootstrapRuntime?.setIsTasksPaneLocked(isLocked);
  },
  setTasksPaneWidth: (width) => {
    set((state) => (
      state.tasksPaneWidth === width
        ? state
        : { tasksPaneWidth: width }
    ));
  },
  setActiveTaskId: (taskId) => {
    set((state) => (
      state.activeTaskId === taskId
        ? state
        : { activeTaskId: taskId }
    ));
  },
  setIsTasksPaneOpen: (isOpen) => {
    activeBootstrapRuntime?.setIsTasksPaneOpen(isOpen);
  },
  resetAllPaneLocks: () => {
    activeBootstrapRuntime?.resetAllPaneLocks();
  },
  bootstrap: (input) => {
    const wasEqual = areBootstrapInputsEqual(activeBootstrapSnapshot, input);
    activeBootstrapOwner = input.owner;
    activeBootstrapSnapshot = input;
    updateBootstrapRuntime(input);

    if (!wasEqual) {
      set((state) => buildBootstrappedState(state, input));
    }
  },
  clearBootstrap: (owner) => {
    if (owner && activeBootstrapOwner && owner !== activeBootstrapOwner) {
      return;
    }

    activeBootstrapOwner = null;
    activeBootstrapSnapshot = null;
    updateBootstrapRuntime(null);
    set(() => createInitialSnapshot());
  },
  resetStore: () => {
    activeBootstrapOwner = null;
    activeBootstrapSnapshot = null;
    updateBootstrapRuntime(null);
    set(() => createInitialSnapshot());
  },
}));

export function usePanesStoreApi() {
  return panesStore;
}

export function usePanesStore<T>(
  selector: (state: PanesStoreState) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  return useStoreWithEqualityFn(panesStore, selector, equalityFn);
}

export function usePanesStoreAvailability(): PanesStoreAvailability {
  return usePanesStore((state) => state.availability, shallow);
}

export function bootstrapPanesStore(input: PanesStoreBootstrapInput): void {
  panesStore.getState().bootstrap(input);
}

export function clearPanesStoreBootstrap(owner?: symbol): void {
  panesStore.getState().clearBootstrap(owner);
}

export function resetPanesStore(): void {
  panesStore.getState().resetStore();
}

/**
 * Singleton panes lifecycle contract:
 * - exactly one mounted bootstrap owner should drive runtime-backed pane state
 * - repeated bootstraps from that owner are idempotent
 * - reads outside bootstrap intentionally return the unlocked default snapshot
 */
export function useBootstrapPanesStore(): void {
  const isLightboxOpen = useLightboxOpenState();
  const ownerRef = useRef<symbol | null>(null);
  if (ownerRef.current === null) {
    ownerRef.current = Symbol('panes-store-bootstrap-owner');
  }

  const {
    locks,
    isGenerationsPaneOpenState,
    isEditorPaneOpenState,
    isTasksPaneOpenState,
    setIsGenerationsPaneLocked,
    setIsEditorPaneLocked,
    setIsShotsPaneLocked,
    setIsTasksPaneLocked,
    setIsGenerationsPaneOpen,
    setIsEditorPaneOpen,
    setIsTasksPaneOpen,
    resetAllPaneLocks,
  } = usePaneLockPolicyState();

  const bootstrapInput = useMemo<PanesStoreBootstrapInput>(() => ({
    owner: ownerRef.current as symbol,
    viewportHeight: getViewportHeight(),
    isLightboxOpen,
    locks,
    isGenerationsPaneOpen: isGenerationsPaneOpenState,
    isEditorPaneOpen: isEditorPaneOpenState,
    isTasksPaneOpen: isTasksPaneOpenState,
    setIsGenerationsPaneLocked,
    setIsEditorPaneLocked,
    setIsShotsPaneLocked,
    setIsTasksPaneLocked,
    setIsGenerationsPaneOpen,
    setIsEditorPaneOpen,
    setIsTasksPaneOpen,
    resetAllPaneLocks,
  }), [
    isLightboxOpen,
    locks,
    isGenerationsPaneOpenState,
    isEditorPaneOpenState,
    isTasksPaneOpenState,
    setIsGenerationsPaneLocked,
    setIsEditorPaneLocked,
    setIsShotsPaneLocked,
    setIsTasksPaneLocked,
    setIsGenerationsPaneOpen,
    setIsEditorPaneOpen,
    setIsTasksPaneOpen,
    resetAllPaneLocks,
  ]);

  useEffect(() => {
    bootstrapPanesStore(bootstrapInput);
  }, [bootstrapInput]);

  useEffect(() => {
    return () => {
      clearPanesStoreBootstrap(ownerRef.current ?? undefined);
    };
  }, []);
}

export function PanesStoreBootstrapBoundary({ children }: { children: ReactNode }) {
  useBootstrapPanesStore();
  return children;
}

export function __resetPanesStoreForTests(): void {
  resetPanesStore();
}
