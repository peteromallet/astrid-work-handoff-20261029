// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RUNTIME_REQUEST_WAIT_MS } from '@/integrations/runtime/useRuntimeRequestWait.ts';
import { WorkspaceDiscoveryPending } from './WorkspaceDiscoveryPending.tsx';

describe('WorkspaceDiscoveryPending', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('keeps the quiet opening state until the deadline, then offers retry and editor actions', () => {
    const onRetry = vi.fn();
    const onOpenEditor = vi.fn();
    render(<WorkspaceDiscoveryPending onRetry={onRetry} onOpenEditor={onOpenEditor} />);

    expect(document.querySelector('[data-boot-hold]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Opening your workspace…' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Astrid is looking for your projects on this computer.');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    act(() => vi.advanceTimersByTime(RUNTIME_REQUEST_WAIT_MS - 1));
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(document.querySelector('[data-boot-hold]')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Still waiting for your workspace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open editor' })).toBeInTheDocument();
    expect(onRetry).not.toHaveBeenCalled();
    expect(onOpenEditor).not.toHaveBeenCalled();
  });

  it('starts a fresh wait after retry and delegates both actions', () => {
    const onRetry = vi.fn();
    const onOpenEditor = vi.fn();
    render(<WorkspaceDiscoveryPending onRetry={onRetry} onOpenEditor={onOpenEditor} />);
    act(() => vi.advanceTimersByTime(RUNTIME_REQUEST_WAIT_MS));

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading', { name: 'Opening your workspace…' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(RUNTIME_REQUEST_WAIT_MS - 1));
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open editor' }));
    expect(onOpenEditor).toHaveBeenCalledOnce();
  });
});
