import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from './mapWithConcurrency';

describe('mapWithConcurrency', () => {
  it('never exceeds the limit and keeps input order', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency(Array.from({ length: 30 }, (_, i) => i), 4, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      await Promise.resolve();
      inFlight--;
      return n * 2;
    });
    expect(peak).toBe(4);
    expect(out).toEqual(Array.from({ length: 30 }, (_, i) => i * 2));
  });

  it('stops starting new work after a rejection', async () => {
    const started: number[] = [];
    await expect(mapWithConcurrency([0, 1, 2, 3, 4, 5, 6, 7], 2, async (n) => {
      started.push(n);
      await Promise.resolve();
      if (n === 1) throw new Error('boom');
      return n;
    })).rejects.toThrow('boom');
    expect(started.length).toBeLessThan(8);
  });

  it('handles empty input', async () => {
    await expect(mapWithConcurrency([], 4, async () => 1)).resolves.toEqual([]);
  });
});
