// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  exitEditorTour,
  getEditorTourState,
  markEditorTourReady,
  setEditorTourBeat,
  startEditorTour,
} from '@/shared/state/editorTourStore';
import { useTourKeys } from './useTourKeys';

let unmountHook: (() => void) | undefined;

beforeEach(() => {
  exitEditorTour();
  localStorage.clear();
  startEditorTour();
});

afterEach(() => {
  unmountHook?.();
  unmountHook = undefined;
  vi.restoreAllMocks();
  exitEditorTour();
  localStorage.clear();
});

function mountKeys(active: boolean) {
  const { unmount } = renderHook(() => useTourKeys(active));
  unmountHook = unmount;
}

/** A beat where Enter advances: land, with both the timeline and the card ready. */
function landReady() {
  setEditorTourBeat(1, 'land');
  markEditorTourReady('timeline');
  markEditorTourReady('card');
}

function key(init: KeyboardEventInit & { key: string }): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
}

describe('useTourKeys', () => {
  it('Enter runs the primary action', () => {
    mountKeys(true);
    landReady();

    window.dispatchEvent(key({ key: 'Enter' }));

    expect(getEditorTourState()).toMatchObject({ act: 2, beat: 'compose' });
  });

  it('Escape finishes the tour', () => {
    mountKeys(true);
    expect(getEditorTourState().status).toBe('running');

    window.dispatchEvent(key({ key: 'Escape' }));

    expect(getEditorTourState().status).toBe('idle');
  });

  it('swallows other keys: they are prevented and never reach document listeners', () => {
    mountKeys(true);
    const documentListener = vi.fn();
    document.addEventListener('keydown', documentListener);
    const event = key({ key: 'k' });

    document.body.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(documentListener).not.toHaveBeenCalled();
    document.removeEventListener('keydown', documentListener);
  });

  it('ignores a held Enter (repeat) but still swallows it', () => {
    mountKeys(true);
    landReady();
    const event = key({ key: 'Enter', repeat: true });

    window.dispatchEvent(event);

    expect(getEditorTourState()).toMatchObject({ act: 1, beat: 'land' });
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves Cmd/Ctrl chords un-prevented, but still keeps them from the app', () => {
    mountKeys(true);
    const documentListener = vi.fn();
    document.addEventListener('keydown', documentListener);
    const event = key({ key: 'r', metaKey: true });

    document.body.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(documentListener).not.toHaveBeenCalled();
    document.removeEventListener('keydown', documentListener);
  });

  it('does not listen at all when inactive', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    mountKeys(false);
    landReady();

    expect(addEventListener).not.toHaveBeenCalledWith('keydown', expect.any(Function), expect.anything());

    window.dispatchEvent(key({ key: 'Enter' }));
    expect(getEditorTourState()).toMatchObject({ act: 1, beat: 'land' });
  });

  it('Backspace does nothing (the composer holds text) but is still swallowed', () => {
    mountKeys(true);
    setEditorTourBeat(2, 'compose');
    const event = key({ key: 'Backspace' });

    window.dispatchEvent(event);

    expect(getEditorTourState()).toMatchObject({ act: 2, beat: 'compose' });
    expect(getEditorTourState().instant).not.toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ArrowLeft goes back one place, prevented', () => {
    mountKeys(true);
    setEditorTourBeat(2, 'land');
    const event = key({ key: 'ArrowLeft' });

    window.dispatchEvent(event);

    expect(getEditorTourState()).toMatchObject({ act: 2, beat: 'compose', instant: true });
    expect(event.defaultPrevented).toBe(true);
  });

  it('ArrowRight is swallowed and does not move the tour', () => {
    mountKeys(true);
    setEditorTourBeat(2, 'land');
    window.dispatchEvent(key({ key: 'ArrowRight' }));
    expect(getEditorTourState()).toMatchObject({ act: 2, beat: 'land' });
  });

  it('Back does nothing on the welcome', () => {
    mountKeys(true);
    window.dispatchEvent(key({ key: 'ArrowLeft' }));
    expect(getEditorTourState()).toMatchObject({ beat: 'welcome' });
  });
});
