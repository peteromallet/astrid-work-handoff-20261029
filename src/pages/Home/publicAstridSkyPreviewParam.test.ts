import { describe, expect, it } from 'vitest';
import { formatSkyPreviewHours, parsePublicAstridSkyPreview } from './publicAstridSkyPreviewParam';

describe('public Astrid sky preview param', () => {
  it('is absent unless ?sky asks for it', () => {
    expect(parsePublicAstridSkyPreview('')).toBeNull();
    expect(parsePublicAstridSkyPreview('?experience=agent')).toBeNull();
    expect(parsePublicAstridSkyPreview('?sky=')).toBeNull();
    expect(parsePublicAstridSkyPreview('?sky=banana')).toBeNull();
  });

  it('shows the control live for ?sky=preview', () => {
    expect(parsePublicAstridSkyPreview('?sky=preview')).toEqual({ hours: null });
    expect(parsePublicAstridSkyPreview('?experience=agent&sky=Preview')).toEqual({ hours: null });
  });

  it('pins to a clock time', () => {
    expect(parsePublicAstridSkyPreview('?sky=03:00')).toEqual({ hours: 3 });
    expect(parsePublicAstridSkyPreview('?sky=17:45')).toEqual({ hours: 17.75 });
    expect(parsePublicAstridSkyPreview('?sky=7:30')).toEqual({ hours: 7.5 });
  });

  it('rejects impossible times', () => {
    expect(parsePublicAstridSkyPreview('?sky=24:00')).toBeNull();
    expect(parsePublicAstridSkyPreview('?sky=12:60')).toBeNull();
  });

  it('formats hours as HH:MM', () => {
    expect(formatSkyPreviewHours(0)).toBe('00:00');
    expect(formatSkyPreviewHours(17.75)).toBe('17:45');
    expect(formatSkyPreviewHours(23.999)).toBe('23:59');
    expect(formatSkyPreviewHours(24)).toBe('00:00');
  });
});
