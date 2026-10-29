// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

let origin = '';
vi.mock('@/integrations/runtime/connection.ts', () => ({
  runtimeOrigin: () => origin,
  runtimeApiBase: () => `${origin}/api/runtime`,
}));

import { TimelineLoadErrorCard } from './TimelineLoadErrorCard.tsx';

const ENGINEER_WORDS = /Runtime|workspace|realm|gateway|127\.0\.0\.1|npm run/i;
const ENGINEER_MESSAGE = 'Workspace Runtime is unavailable at http://127.0.0.1:17340/api/runtime: http_error: HTTP 503. Start the supported Runtime and configure its authenticated connector, then retry.';

afterEach(() => {
  origin = '';
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A gateway whose answer the test sets: `null` is nothing answering, otherwise the Runtime instance that does. */
function stubGateway() {
  const gateway: { instance: string | null } = { instance: null };
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (gateway.instance === null) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify({ runtime_instance_id: gateway.instance }), { status: 200 });
  }));
  return gateway;
}

describe('TimelineLoadErrorCard on the hosted build', () => {
  it('never prints the error message: one friendly line and Try again', () => {
    origin = 'http://127.0.0.1:17340';
    const onRetry = vi.fn();
    render(<TimelineLoadErrorCard message={ENGINEER_MESSAGE} onRetry={onRetry} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load this timeline");
    expect(alert).toHaveTextContent("Astrid on this computer didn't answer in time.");
    expect(document.body.textContent).not.toMatch(ENGINEER_WORDS);
    expect(document.body.textContent).not.toMatch(/toolbar/);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('sits in the timeline panel\'s own surface, with the connection cards\' words: centred, a serif heading, and one filled primary button', () => {
    origin = 'http://127.0.0.1:17340';
    stubGateway();
    render(<TimelineLoadErrorCard message={ENGINEER_MESSAGE} onRetry={vi.fn()} />);

    const alert = screen.getByRole('alert');
    // The same rounded card the loaded timeline fills (TimelineEditorCoreBody), so the editor's frame stays whole.
    expect(alert).toHaveClass('h-full', 'overflow-auto', 'rounded-xl', 'border-border', 'bg-card/95', 'text-center');
    const heading = screen.getByRole('heading', { name: "Couldn't load this timeline" });
    expect(heading).toHaveClass('font-serif', 'font-theme-heading', 'sm:text-2xl');
    expect(heading.closest('.max-w-md')).not.toBeNull();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveClass('w-full', 'sm:w-auto', 'bg-primary');
    expect(buttons[0]).not.toHaveClass('border');
  });

  it('tries again by itself when Astrid answers, once per time it starts answering, and keeps Try again as the one button', async () => {
    vi.useFakeTimers();
    origin = 'http://127.0.0.1:17340';
    const gateway = stubGateway();
    const onRetry = vi.fn();
    render(<TimelineLoadErrorCard message={ENGINEER_MESSAGE} onRetry={onRetry} />);

    // Nothing answers: no retry, however long it takes.
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(onRetry).not.toHaveBeenCalled();

    // Astrid starts answering: one retry, and no more while it keeps answering.
    gateway.instance = 'runtime-a';
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(onRetry).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(onRetry).toHaveBeenCalledTimes(1);

    // It stops and answers again: the load is tried again.
    gateway.instance = null;
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });
    gateway.instance = 'runtime-a';
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('does not retry by itself when the load failed while Astrid was answering, so the card never loops', async () => {
    vi.useFakeTimers();
    origin = 'http://127.0.0.1:17340';
    const gateway = stubGateway();
    gateway.instance = 'runtime-a';
    const onRetry = vi.fn();
    render(<TimelineLoadErrorCard message={ENGINEER_MESSAGE} onRetry={onRetry} />);

    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(onRetry).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('asks nothing of the gateway same-origin', async () => {
    vi.useFakeTimers();
    origin = '';
    const gateway = stubGateway();
    gateway.instance = 'runtime-a';
    const onRetry = vi.fn();
    render(<TimelineLoadErrorCard message="bridge unreachable" onRetry={onRetry} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });

    expect(fetch).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('is unchanged same-origin', () => {
    origin = '';
    render(<TimelineLoadErrorCard message="bridge unreachable" onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load this timeline');
    expect(screen.getByRole('alert')).toHaveTextContent('bridge unreachable');
  });
});
