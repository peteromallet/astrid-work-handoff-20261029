import { describe, expect, it } from 'vitest';
import { formatDuration, getMaxGapFrames } from './videoPortionEditorUtils';

describe('videoPortionEditorUtils', () => {
  it('formats frame durations using fps when available', () => {
    expect(formatDuration(12, 24)).toBe('500ms');
    expect(formatDuration(48, 24)).toBe('2.0s');
    expect(formatDuration(12, null)).toBe('');
    expect(formatDuration(12, 0)).toBe('');
  });

  it('caps maximum gap frames based on context frame usage', () => {
    expect(getMaxGapFrames(0)).toBe(81);
    expect(getMaxGapFrames(10)).toBe(61);
    expect(getMaxGapFrames(60)).toBe(1);
  });
});
