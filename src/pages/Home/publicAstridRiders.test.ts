import { describe, expect, it } from 'vitest';
import { placeTransport, RIDERS } from './publicAstridRiders';

describe('publicAstridRiders', () => {
  it('hugs the bottom edge of the host, padded 10px, at 24% height', () => {
    const box = placeTransport({ left: 100, top: 50, width: 400, height: 200 });
    expect(box).toEqual({ left: 110, top: 50 + 200 - 10 - 48, width: 380, height: 48 });
  });

  it('caps the height at 78px and never goes negative on a collapsed host', () => {
    expect(placeTransport({ left: 0, top: 0, width: 800, height: 1000 }).height).toBe(78);
    expect(placeTransport({ left: 0, top: 0, width: 4, height: 0 })).toMatchObject({ width: 0, height: 0 });
  });

  it('follows the host box wherever the journey has put it', () => {
    const a = placeTransport({ left: 10, top: 10, width: 300, height: 100 });
    const b = placeTransport({ left: 110, top: 60, width: 300, height: 100 });
    expect([b.left - a.left, b.top - a.top]).toEqual([100, 50]);
  });

  it('registers the transport as an app rider on the player', () => {
    expect(RIDERS).toEqual([expect.objectContaining({ overlay: '.astrid-preview-transport-outlet', host: '.astrid-player-surface', audience: 'app' })]);
  });
});
