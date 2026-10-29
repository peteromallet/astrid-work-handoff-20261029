// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRuntimeRestartWatch, type RuntimeRestartStatus } from './useRuntimeRestartWatch.ts';

/** Matches the hook's default check interval and HEALTH_TIMEOUT_MS: one period is one reading, and a timeout ends inside its period. */
const TICK_MS = 3000;
/** Upper bound on periods for a status to appear; the tests fail with the last status seen, not a timeout. */
const MAX_PERIODS = 12;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type Step = (init?: RequestInit) => Promise<Response>;

const json = (body: unknown, status = 200): Step => async () => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});
const healthy = (instanceId: string): Step => json({ status: 'ok', runtime_instance_id: instanceId });
/** Nothing is there: the fetch rejects at once, as a refused port does. */
const networkError: Step = async () => { throw new TypeError('Failed to fetch'); };
/** The port takes the request and never answers: rejects only when the hook's own abort timer fires. */
const timeout: Step = (init) => new Promise<Response>((_resolve, reject) => {
  init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
});
const unavailable: Step = json({ error: 'runtime_unavailable' }, 503);

/** Answers the health route with whatever `step` is set to; the test changes it while the page is watching. */
function switchable(first: Step) {
  const route = { step: first };
  const fetchImpl = vi.fn(async (_input: string, init?: RequestInit) => route.step(init));
  return { route, fetchImpl };
}

/** Answers the health route in order; the last answer repeats. */
function sequence(...steps: Step[]) {
  let index = 0;
  return vi.fn(async (_input: string, init?: RequestInit) => {
    const step = steps[Math.min(index, steps.length - 1)];
    index += 1;
    return step(init);
  });
}

/** Answers the health route in order, then starts over: for alternating patterns. */
function cycle(...steps: Step[]) {
  let index = 0;
  return vi.fn(async (_input: string, init?: RequestInit) => {
    const step = steps[index % steps.length];
    index += 1;
    return step(init);
  });
}

/** The refusal check (a `no-cors` follow-up to a network failure) is answered by `noCors`, not by the scripted health steps. */
function watch(
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>,
  enabled = true,
  { noCors = async () => { throw new TypeError('Failed to fetch'); }, confirmPermission }: { noCors?: () => Promise<Response>; confirmPermission?: () => Promise<boolean> } = {},
) {
  const routed = (input: string, init?: RequestInit) => init?.mode === 'no-cors' ? noCors() : fetchImpl(input, init);
  return renderHook(
    ({ on }: { on: boolean }) => useRuntimeRestartWatch(on, { intervalMs: TICK_MS, fetchImpl: routed, confirmPermission }),
    { initialProps: { on: enabled } },
  );
}

/** Lets one check period pass with fake timers, so the reading due in it lands. */
async function tick(periods = 1) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(TICK_MS * periods);
  });
}

/** Advances one period at a time until the status is `want`. Returns every status seen along the way. */
async function until(result: { current: RuntimeRestartStatus }, want: RuntimeRestartStatus) {
  const seen: RuntimeRestartStatus[] = [result.current];
  for (let i = 0; i < MAX_PERIODS && result.current !== want; i += 1) {
    await tick();
    seen.push(result.current);
  }
  expect(result.current, `statuses seen: ${seen.join(' > ')}`).toBe(want);
  return seen;
}

/** Advances `periods` periods one at a time and returns every status seen after each one. */
async function run(periods: number, result: { current: RuntimeRestartStatus }) {
  const seen: RuntimeRestartStatus[] = [];
  for (let i = 0; i < periods; i += 1) {
    await tick();
    seen.push(result.current);
  }
  return seen;
}

describe('useRuntimeRestartWatch: slow readings (our abort timer fired)', () => {
  it('two timeouts in a row are busy, never stopped', async () => {
    const { route, fetchImpl } = switchable(healthy('instance-1'));
    const { result } = watch(fetchImpl);
    await tick();
    expect(result.current).toBe('ok');

    route.step = timeout;
    const seen = await until(result, 'busy');
    expect(seen).not.toContain('stopped');
  });

  it('one timeout alone is still ok', async () => {
    const { route, fetchImpl } = switchable(healthy('instance-1'));
    const { result } = watch(fetchImpl);
    await tick();

    route.step = timeout;
    await tick();
    expect(result.current).toBe('ok');
    // The port answers again on the next reading: the single slow one leaves no trace.
    route.step = healthy('instance-1');
    await tick(3);
    expect(result.current).toBe('ok');
  });

  it('busy then an ok reading is ok again, with no restart', async () => {
    const { route, fetchImpl } = switchable(healthy('instance-1'));
    const { result } = watch(fetchImpl);
    await tick();

    route.step = timeout;
    await until(result, 'busy');
    route.step = healthy('instance-1');
    await until(result, 'ok');
  });

  it('stopped then one slow reading is busy at once', async () => {
    const { route, fetchImpl } = switchable(healthy('instance-1'));
    const { result } = watch(fetchImpl);
    await tick();

    route.step = networkError;
    await until(result, 'stopped');
    // One slow reading is enough: the port is taking requests again.
    route.step = timeout;
    await until(result, 'busy');
  });

  it('many timeouts in a row never produce stopped', async () => {
    const { route, fetchImpl } = switchable(healthy('instance-1'));
    const { result } = watch(fetchImpl);
    await tick();

    route.step = timeout;
    const seen = await run(60, result);
    expect(seen).toContain('busy');
    expect(seen).not.toContain('stopped');
    expect(seen).not.toContain('restarted');
    expect(result.current).toBe('busy');
    expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(20);
  });

  it('busy then two network errors is stopped', async () => {
    const { route, fetchImpl } = switchable(healthy('instance-1'));
    const { result } = watch(fetchImpl);
    await tick();

    route.step = timeout;
    await until(result, 'busy');
    route.step = networkError;
    await until(result, 'stopped');
  });

  it('busy then an ok reading with a different instance is restarted', async () => {
    const { route, fetchImpl } = switchable(healthy('instance-1'));
    const { result } = watch(fetchImpl);
    await tick();

    route.step = timeout;
    await until(result, 'busy');
    route.step = healthy('instance-2');
    const seen = await until(result, 'restarted');
    expect(seen).not.toContain('stopped');
  });

  it('alternating timeout and network error never reaches busy or stopped', async () => {
    const fetchImpl = cycle(timeout, networkError);
    const { result } = watch(fetchImpl);

    const seen = await run(20, result);
    expect(seen).not.toContain('busy');
    expect(seen).not.toContain('stopped');
    expect(result.current).toBe('ok');
    expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(10);
  });
});

describe('useRuntimeRestartWatch: failed readings', () => {
  it('two network errors in a row are stopped', async () => {
    const fetchImpl = sequence(networkError);
    const { result } = watch(fetchImpl);

    const seen = await until(result, 'stopped');
    expect(seen).not.toContain('busy');
  });

  it('two 503s that are not an identity change are stopped', async () => {
    const fetchImpl = sequence(unavailable);
    const { result } = watch(fetchImpl);

    await until(result, 'stopped');
  });

  it('stopped then an ok reading with the same instance is ok', async () => {
    const { route, fetchImpl } = switchable(healthy('instance-1'));
    const { result } = watch(fetchImpl);
    await tick();

    route.step = networkError;
    await until(result, 'stopped');
    route.step = healthy('instance-1');
    await until(result, 'ok');
  });

  it('a disabled watch asks nothing and stays ok', async () => {
    const fetchImpl = sequence(networkError);
    const { result } = watch(fetchImpl, false);

    await run(3, result);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.current).toBe('ok');
  });
});

describe('useRuntimeRestartWatch: evidence for a failed CORS read', () => {
  const opaque = async () => new Response(null, { status: 200 });

  it('a no-cors request that still answers is refused, not stopped', async () => {
    const fetchImpl = sequence(networkError);
    const { result } = watch(fetchImpl, true, { noCors: opaque });
    const seen = await until(result, 'refused');
    expect(seen).not.toContain('stopped');
  });

  it('nothing answering the no-cors request either is stopped', async () => {
    const { result } = watch(sequence(networkError), true);
    const seen = await until(result, 'stopped');
    expect(seen).not.toContain('refused');
  });

  it('refused clears itself when the door accepts the page again', async () => {
    const { route, fetchImpl } = switchable(healthy('instance-1'));
    const { result } = watch(fetchImpl, true, { noCors: opaque });
    await tick();
    route.step = networkError;
    await until(result, 'refused');
    route.step = healthy('instance-1');
    await until(result, 'ok');
  });

  it('without the permission nothing is blamed on Astrid, and no no-cors request is sent', async () => {
    const noCors = vi.fn(opaque);
    const confirmPermission = vi.fn(async () => false);
    const { result } = watch(sequence(networkError), true, { noCors, confirmPermission });
    const seen = await run(6, result);
    expect(confirmPermission).toHaveBeenCalled();
    expect(noCors).not.toHaveBeenCalled();
    expect(seen.every((status) => status === 'ok')).toBe(true);
  });

  it('asks the permission again before each failed reading becomes stopped', async () => {
    const confirmPermission = vi.fn(async () => true);
    const { result } = watch(sequence(networkError), true, { confirmPermission });
    await until(result, 'stopped');
    expect(confirmPermission.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
