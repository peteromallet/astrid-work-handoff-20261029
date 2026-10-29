import { describe, expect, it } from 'vitest';
import { getRegenerationZoneInfo } from './regenerationZoneInfo';

describe('getRegenerationZoneInfo', () => {
  const selections = [
    { id: 'b', start: 5, end: 7 },
    { id: 'a', start: 1, end: 3 },
  ];

  it('returns in-zone details for matching time', () => {
    const result = getRegenerationZoneInfo(2, selections);
    expect(result.inZone).toBe(true);
    expect(result.segmentIndex).toBe(0);
    expect(result.selection?.id).toBe('a');
  });

  it('returns out-of-zone details when no selection matches', () => {
    const result = getRegenerationZoneInfo(10, selections);
    expect(result.inZone).toBe(false);
    expect(result.segmentIndex).toBe(-1);
    expect(result.selection).toBeNull();
  });
});
