import { describe, expect, it } from 'vitest';
import { buildVideoLightboxLayoutState } from './buildVideoLightboxLayoutState';

function makeInput(overrides: Partial<Parameters<typeof buildVideoLightboxLayoutState>[0]> = {}) {
  return {
    isMobile: false,
    isFormOnlyMode: false,
    isTabletOrLarger: true,
    isPortraitMode: false,
    shouldShowSidePanel: false,
    hasSegmentVideo: false,
    showTaskDetails: false,
    isSegmentSlotMode: false,
    effectiveTasksPaneOpen: false,
    isTasksPaneLocked: false,
    ...overrides,
  };
}

describe('buildVideoLightboxLayoutState', () => {
  it('returns desktop panel layout when side panel is explicitly enabled', () => {
    const state = buildVideoLightboxLayoutState(makeInput({
      shouldShowSidePanel: true,
      effectiveTasksPaneOpen: true,
    }));

    expect(state).toEqual({
      shouldShowSidePanel: true,
      showPanel: true,
      needsFullscreenLayout: true,
      needsTasksPaneOffset: true,
      panelVariant: 'desktop',
    });
  });

  it('returns mobile panel layout when showing task details on mobile', () => {
    const state = buildVideoLightboxLayoutState(makeInput({
      isMobile: true,
      isTabletOrLarger: false,
      showTaskDetails: true,
    }));

    expect(state).toEqual({
      shouldShowSidePanel: false,
      showPanel: true,
      needsFullscreenLayout: true,
      needsTasksPaneOffset: false,
      panelVariant: 'mobile',
    });
  });

  it('keeps compact desktop layout when no panel conditions are active', () => {
    const state = buildVideoLightboxLayoutState(makeInput());

    expect(state).toEqual({
      shouldShowSidePanel: false,
      showPanel: false,
      needsFullscreenLayout: false,
      needsTasksPaneOffset: false,
      panelVariant: 'mobile',
    });
  });
});
