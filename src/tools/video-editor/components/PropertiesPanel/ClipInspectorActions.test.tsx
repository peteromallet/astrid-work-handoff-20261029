// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClipInspectorActions } from './ClipInspectorActions.tsx';

function renderActions(overrides: Partial<ComponentProps<typeof ClipInspectorActions>> = {}) {
  const props: ComponentProps<typeof ClipInspectorActions> = {
    muted: false,
    canMoveTrack: true,
    canSplit: true,
    canToggleMute: true,
    setActiveTab: vi.fn(),
    onSetInteractionMode: vi.fn(),
    onMoveTrackUp: vi.fn(),
    onMoveTrackDown: vi.fn(),
    onSplitAtPlayhead: vi.fn(),
    onToggleMute: vi.fn(),
    ...overrides,
  };
  render(<ClipInspectorActions {...props} />);
  return props;
}

describe('ClipInspectorActions', () => {
  it.each(['Move', 'Trim'] as const)('%s arms the touch gesture and shows the clip timing', (label) => {
    const props = renderActions();

    fireEvent.click(screen.getByRole('button', { name: label }));

    expect(props.onSetInteractionMode).toHaveBeenCalledWith(label.toLowerCase());
    expect(props.setActiveTab).toHaveBeenCalledWith('timing');
  });

  it('runs split, mute and the track moves directly', () => {
    const props = renderActions();

    fireEvent.click(screen.getByRole('button', { name: 'Split' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    fireEvent.click(screen.getByRole('button', { name: 'Track up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Track down' }));

    expect(props.onSplitAtPlayhead).toHaveBeenCalledTimes(1);
    expect(props.onToggleMute).toHaveBeenCalledTimes(1);
    expect(props.onMoveTrackUp).toHaveBeenCalledTimes(1);
    expect(props.onMoveTrackDown).toHaveBeenCalledTimes(1);
  });

  it('names the mute action for the state it changes', () => {
    renderActions({ muted: true });

    expect(screen.getByRole('button', { name: 'Unmute' })).toBeEnabled();
  });

  it('disables a track move with nowhere to go', () => {
    renderActions({ onMoveTrackUp: undefined });

    expect(screen.getByRole('button', { name: 'Track up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Track down' })).toBeEnabled();
  });

  it('leaves out what the clip type cannot do instead of showing it disabled', () => {
    renderActions({ canToggleMute: false, canSplit: false, canMoveTrack: false });

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Move', 'Trim']);
  });

  it('offers one way to each action: delete lives in the clip header, precision nowhere on touch', () => {
    renderActions();

    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /precision/i })).toBeNull();
    // Each target clears the 44px touch minimum (jsdom has no layout, so assert the class).
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain('h-14');
    }
  });
});
