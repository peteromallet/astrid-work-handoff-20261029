import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PANE_CONFIG } from '@/shared/config/panes';
import {
  __resetPanesStoreForTests,
  bootstrapPanesStore,
  clearPanesStoreBootstrap,
  preferredGenerationsHeight,
  usePanesStoreApi,
  type PanesStoreBootstrapInput,
} from './panesStore';

function makeBootstrapInput(
  owner: symbol,
  overrides: Partial<Pick<PanesStoreBootstrapInput, 'isGenerationsPaneOpen' | 'isEditorPaneOpen' | 'isLightboxOpen' | 'locks'>> = {},
): PanesStoreBootstrapInput {
  return {
    owner,
    viewportHeight: 900,
    locks: {
      shots: false,
      tasks: true,
      gens: false,
      editor: false,
      ...overrides.locks,
    },
    isGenerationsPaneOpen: overrides.isGenerationsPaneOpen ?? false,
    isEditorPaneOpen: overrides.isEditorPaneOpen ?? false,
    isLightboxOpen: overrides.isLightboxOpen,
    isTasksPaneOpen: true,
    setIsGenerationsPaneLocked: vi.fn(),
    setIsEditorPaneLocked: vi.fn(),
    setIsShotsPaneLocked: vi.fn(),
    setIsTasksPaneLocked: vi.fn(),
    setIsGenerationsPaneOpen: vi.fn(),
    setIsEditorPaneOpen: vi.fn(),
    setIsTasksPaneOpen: vi.fn(),
    resetAllPaneLocks: vi.fn(),
  };
}

describe('panesStore bootstrap', () => {
  beforeEach(() => {
    __resetPanesStoreForTests();
  });

  afterEach(() => {
    __resetPanesStoreForTests();
  });

  it('does not notify subscribers again when only bootstrap callback identities change', () => {
    const owner = Symbol('test-bootstrap-owner');
    const store = usePanesStoreApi();
    let notificationCount = 0;
    const unsubscribe = store.subscribe(() => {
      notificationCount += 1;
    });

    try {
      const firstInput = makeBootstrapInput(owner);
      const secondInput = makeBootstrapInput(owner);
      expect(firstInput.setIsTasksPaneOpen).not.toBe(secondInput.setIsTasksPaneOpen);

      bootstrapPanesStore(firstInput);
      expect(notificationCount).toBe(1);

      bootstrapPanesStore(secondInput);
      expect(notificationCount).toBe(1);
    } finally {
      unsubscribe();
      clearPanesStoreBootstrap(owner);
    }
  });
});

describe('panesStore generations content height', () => {
  const cap = PANE_CONFIG.dimensions.DEFAULT_HEIGHT;
  const lightboxHeight = PANE_CONFIG.dimensions.LIGHTBOX_GALLERY_HEIGHT;

  beforeEach(() => {
    __resetPanesStoreForTests();
  });

  afterEach(() => {
    __resetPanesStoreForTests();
  });

  it('preferredGenerationsHeight shrinks to content and never exceeds the cap', () => {
    expect(preferredGenerationsHeight(350, null)).toBe(350);
    expect(preferredGenerationsHeight(350, 200)).toBe(200);
    expect(preferredGenerationsHeight(350, 500)).toBe(350);
  });

  it('starts with null content height', () => {
    expect(usePanesStoreApi().getState().generationsPaneContentHeight).toBeNull();
  });

  it('keeps the effective height unchanged when content is unknown', () => {
    const owner = Symbol('content-null');
    try {
      bootstrapPanesStore(makeBootstrapInput(owner, { isGenerationsPaneOpen: true, isEditorPaneOpen: true }));
      const state = usePanesStoreApi().getState();
      expect(state.generationsPaneContentHeight).toBeNull();
      expect(state.effectiveGenerationsPaneHeight).toBe(cap);
      expect(state.effectiveEditorPaneHeight).toBe(450);
    } finally {
      clearPanesStoreBootstrap(owner);
    }
  });

  it('hugs content below the cap', () => {
    const owner = Symbol('content-200');
    try {
      bootstrapPanesStore(makeBootstrapInput(owner, { isGenerationsPaneOpen: true, isEditorPaneOpen: true }));
      usePanesStoreApi().getState().setGenerationsPaneContentHeight(200);
      const state = usePanesStoreApi().getState();
      expect(state.generationsPaneHeight).toBe(cap);
      expect(state.effectiveGenerationsPaneHeight).toBe(200);
      expect(state.effectiveEditorPaneHeight).toBe(450);
    } finally {
      clearPanesStoreBootstrap(owner);
    }
  });

  it('caps the effective height at the maximum when content is taller', () => {
    const owner = Symbol('content-500');
    try {
      bootstrapPanesStore(makeBootstrapInput(owner, { isGenerationsPaneOpen: true, isEditorPaneOpen: true }));
      usePanesStoreApi().getState().setGenerationsPaneContentHeight(500);
      expect(usePanesStoreApi().getState().effectiveGenerationsPaneHeight).toBe(cap);
    } finally {
      clearPanesStoreBootstrap(owner);
    }
  });

  it('keeps the lightbox branch at min(preferred, lightbox height)', () => {
    const owner = Symbol('lightbox');
    try {
      bootstrapPanesStore(makeBootstrapInput(owner, { isGenerationsPaneOpen: true, isLightboxOpen: true }));
      expect(usePanesStoreApi().getState().effectiveGenerationsPaneHeight).toBe(Math.min(cap, lightboxHeight));

      usePanesStoreApi().getState().setGenerationsPaneContentHeight(100);
      expect(usePanesStoreApi().getState().effectiveGenerationsPaneHeight).toBe(Math.min(100, lightboxHeight));
    } finally {
      clearPanesStoreBootstrap(owner);
    }
  });

  it('keeps the both-locked split at viewport - editor when content is null', () => {
    const owner = Symbol('both-locked-null');
    try {
      bootstrapPanesStore(makeBootstrapInput(owner, {
        locks: { shots: false, tasks: true, gens: true, editor: true },
      }));
      const state = usePanesStoreApi().getState();
      expect(state.generationsPaneContentHeight).toBeNull();
      expect(state.effectiveGenerationsPaneHeight).toBe(900 - 450);
      expect(state.effectiveEditorPaneHeight).toBe(450);
    } finally {
      clearPanesStoreBootstrap(owner);
    }
  });

  it('uses min(viewport - editor, preferred) when both panes are locked and content is known', () => {
    const owner = Symbol('both-locked');
    try {
      bootstrapPanesStore(makeBootstrapInput(owner, {
        locks: { shots: false, tasks: true, gens: true, editor: true },
      }));
      usePanesStoreApi().getState().setGenerationsPaneContentHeight(300);
      const state = usePanesStoreApi().getState();
      expect(state.effectiveGenerationsPaneHeight).toBe(Math.min(900 - 450, 300));
      expect(state.effectiveEditorPaneHeight).toBe(450);
    } finally {
      clearPanesStoreBootstrap(owner);
    }
  });

  it('rounds content heights and treats non-finite or non-positive values as null', () => {
    const store = usePanesStoreApi();
    store.getState().setGenerationsPaneContentHeight(200.4);
    expect(store.getState().generationsPaneContentHeight).toBe(200);

    store.getState().setGenerationsPaneContentHeight(Number.NaN);
    expect(store.getState().generationsPaneContentHeight).toBeNull();

    store.getState().setGenerationsPaneContentHeight(120);
    store.getState().setGenerationsPaneContentHeight(0);
    expect(store.getState().generationsPaneContentHeight).toBeNull();
  });

  it('does not change state identity when content height is set to the same value', () => {
    const store = usePanesStoreApi();
    store.getState().setGenerationsPaneContentHeight(200);
    const before = store.getState();

    store.getState().setGenerationsPaneContentHeight(200);
    expect(store.getState()).toBe(before);
  });

  it('remembers content height across a bootstrap recompute', () => {
    const owner = Symbol('remember');
    try {
      usePanesStoreApi().getState().setGenerationsPaneContentHeight(200);
      bootstrapPanesStore(makeBootstrapInput(owner, { isGenerationsPaneOpen: true, isEditorPaneOpen: true }));
      const state = usePanesStoreApi().getState();
      expect(state.generationsPaneContentHeight).toBe(200);
      expect(state.effectiveGenerationsPaneHeight).toBe(200);
    } finally {
      clearPanesStoreBootstrap(owner);
    }
  });
});
