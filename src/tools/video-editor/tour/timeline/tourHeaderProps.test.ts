import { describe, expect, it } from 'vitest';
import { tourHeaderProps } from './tourHeaderProps.ts';

describe('tourHeaderProps', () => {
  it('uses the demo identity and disables its project controls', () => {
    expect(tourHeaderProps()).toEqual({
      projectId: null,
      timelineId: 'tour-timeline',
      projectName: 'Onboarding project',
      timelineName: 'Lantern Valley',
      disabled: true,
    });
  });
});
