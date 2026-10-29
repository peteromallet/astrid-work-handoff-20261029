import { useDeviceInfo } from '@/shared/hooks/mobile';

interface UseLayoutModeParams {
  isMobile: boolean;
  showTaskDetails: boolean;
  isVideo: boolean;
}

interface UseLayoutModeReturn {
  isTabletOrLarger: boolean;
  isTouchLikeDevice: boolean;
  shouldShowSidePanel: boolean;
  isPortraitMode: boolean;
}

/**
 * Hook to detect layout mode and device capabilities
 * Determines which layout variant to use (desktop/mobile/tablet)
 */
export const useLayoutMode = ({
  showTaskDetails,
  isVideo,
}: UseLayoutModeParams): UseLayoutModeReturn => {
  // Use shared device detection hook for all device/orientation detection
  const { isTabletOrLarger, isPortraitMode: isPortrait, isTouchDevice: isTouchLikeDevice } = useDeviceInfo();

  // Show sidebar on tablet/larger for task details or video metadata.
  // Note: We show sidebar immediately for showTaskDetails to prevent layout jump while task loads
  // Exception: On portrait tablets (like vertical iPad), use mobile layout for better UX
  const shouldShowSidePanel = !isPortrait && isTabletOrLarger && (showTaskDetails || isVideo);

  return {
    isTabletOrLarger,
    isTouchLikeDevice,
    shouldShowSidePanel,
    isPortraitMode: isPortrait
  };
};

