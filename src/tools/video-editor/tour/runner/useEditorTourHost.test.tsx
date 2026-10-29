// @vitest-environment jsdom

import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { exitEditorTour, getEditorTourState, markEditorTourReady, startEditorTour } from '@/shared/state/editorTourStore';
import { EditorTourSlot } from '../timeline/editorTourSlot';
import { useEditorTourHost } from './useEditorTourHost';

vi.mock('@/shared/hooks/mobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useViewportWidth: () => 1440,
  isTabletHardware: () => false,
}));

function Page() {
  useEditorTourHost();
  return <EditorTourSlot />;
}

beforeEach(() => {
  exitEditorTour();
  localStorage.clear();
});

afterEach(async () => {
  // The runner ends a tour on unmount one tick later; let that settle before the next test starts its own.
  await new Promise((resolve) => setTimeout(resolve, 0));
  exitEditorTour();
  localStorage.clear();
});

describe('useEditorTourHost', () => {
  it('never starts automatically and shows the runner only for an explicit replay', async () => {
    const { unmount } = render(<Page />);

    expect(getEditorTourState().status).toBe('idle');
    act(() => startEditorTour());
    await waitFor(() => expect(getEditorTourState().status).toBe('running'));
    expect(document.querySelector('[data-editor-tour-shield]')).not.toBeNull();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(getEditorTourState().status).toBe('idle');
    expect(document.querySelector('[data-editor-tour-shield]')).toBeNull();
    unmount();
  });

  it('does not start without a selection, and Enter swallows the keystroke while running', async () => {
    const idle = render(<Page />);
    expect(getEditorTourState().status).toBe('idle');
    idle.unmount();

    const { unmount } = render(<Page />);
    act(() => startEditorTour());
    await waitFor(() => expect(document.querySelector('[data-editor-tour-shield]')).not.toBeNull());
    // Enter advances the welcome beat after its card is ready.
    // The welcome card has played its entrance, so Enter is its OK.
    act(() => markEditorTourReady('card'));
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(enter);
    });
    expect(enter.defaultPrevented).toBe(true);
    expect(getEditorTourState()).toMatchObject({ act: 1, beat: 'compose' });
    unmount();
  });

  it('does not let a deferred unmount from an old runner finish a replacement run', async () => {
    const first = render(<Page />);
    act(() => startEditorTour());
    await waitFor(() => expect(document.querySelector('[data-editor-tour-shield]')).not.toBeNull());
    const firstRunId = getEditorTourState().runId;
    first.unmount();

    const second = render(<Page />);
    act(() => startEditorTour());
    await waitFor(() => expect(document.querySelector('[data-editor-tour-shield]')).not.toBeNull());
    expect(getEditorTourState().runId).toBeGreaterThan(firstRunId);

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(getEditorTourState().status).toBe('running');
    second.unmount();
  });

  it('preserves StrictMode effect replay and finishes on the real unmount', async () => {
    const view = render(<StrictMode><Page /></StrictMode>);
    act(() => startEditorTour());
    await waitFor(() => expect(document.querySelector('[data-editor-tour-shield]')).not.toBeNull());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(getEditorTourState().status).toBe('running');

    view.unmount();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(getEditorTourState().status).toBe('idle');
  });
});
