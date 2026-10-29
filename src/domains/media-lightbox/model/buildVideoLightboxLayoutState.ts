interface BuildVideoLightboxLayoutStateInput {
  isMobile: boolean;
  isFormOnlyMode: boolean;
  isTabletOrLarger: boolean;
  isPortraitMode: boolean;
  shouldShowSidePanel: boolean;
  hasSegmentVideo: boolean;
  showTaskDetails: boolean;
  isSegmentSlotMode: boolean;
  effectiveTasksPaneOpen: boolean;
  isTasksPaneLocked: boolean;
}

interface VideoLightboxLayoutState {
  shouldShowSidePanel: boolean;
  showPanel: boolean;
  needsFullscreenLayout: boolean;
  needsTasksPaneOffset: boolean;
  panelVariant: 'desktop' | 'mobile';
}

export function buildVideoLightboxLayoutState(
  input: BuildVideoLightboxLayoutStateInput,
): VideoLightboxLayoutState {
  const shouldShowSidePanel = input.shouldShowSidePanel;

  const showPanel = shouldShowSidePanel
    || input.showTaskDetails
    || ((input.isSegmentSlotMode && input.hasSegmentVideo) && input.isMobile);

  const needsFullscreenLayout = input.isMobile
    || input.isFormOnlyMode
    || shouldShowSidePanel;

  const needsTasksPaneOffset = needsFullscreenLayout
    && (input.effectiveTasksPaneOpen || input.isTasksPaneLocked)
    && !input.isPortraitMode
    && input.isTabletOrLarger;

  const panelVariant = (shouldShowSidePanel && !input.isMobile)
    ? 'desktop'
    : 'mobile';

  return {
    shouldShowSidePanel,
    showPanel,
    needsFullscreenLayout,
    needsTasksPaneOffset,
    panelVariant,
  };
}
