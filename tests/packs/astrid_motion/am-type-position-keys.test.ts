import {expect, test} from 'bun:test';
import {interpolateKeys} from '../../../astrid/packs/astrid_motion/rendering/elements/effects/am-type/position-keys';

const keys = [{at: 10, y: 500}, {at: 30, y: 300, ease: 'linear' as const}];

test('absent or empty keyframes leave y alone', () => {
  expect(interpolateKeys(undefined, 'y', 5)).toBeUndefined();
  expect(interpolateKeys([], 'y', 5)).toBeUndefined();
  expect(interpolateKeys([{at: 3, x: 1}], 'y', 5)).toBeUndefined();
});

test('holds outside the range and glides smoothly inside it', () => {
  expect(interpolateKeys(keys, 'y', 0)).toBe(500);
  expect(interpolateKeys(keys, 'y', 40)).toBe(300);
  expect(interpolateKeys(keys, 'y', 20)).toBe(400);
  expect(interpolateKeys(keys, 'y', 21)).toBeCloseTo(390, 5);
});

test('easeOut front-loads motion and keys may be unsorted', () => {
  const eased = interpolateKeys([{at: 30, y: 300}, {at: 10, y: 500}], 'y', 20) as number;
  expect(eased).toBeLessThan(400);
  expect(eased).toBeGreaterThan(300);
});
