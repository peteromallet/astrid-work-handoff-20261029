import { useIsMobile, useIsTablet, useViewportWidth, isTabletHardware } from '@/shared/hooks/mobile';
import { resolveTimelineDeviceClass, type TimelineDeviceClass } from '../../lib/mobile-interaction-model';

/** The layout the editor itself chose (phone, tablet or desktop); the tour lays itself out to match. */
export function useEditorDeviceClass(): TimelineDeviceClass {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const viewportWidth = useViewportWidth();
  return resolveTimelineDeviceClass({ isMobile, isTablet, viewportWidth, isTabletHardware: isTabletHardware() });
}

/** The same desktop test the editor itself uses to choose its layout. */
export function useIsDesktopEditor(): boolean {
  return useEditorDeviceClass() === 'desktop';
}
