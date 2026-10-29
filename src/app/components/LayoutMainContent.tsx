import type { CSSProperties } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AppMainContent } from '@/app/components/AppMainContent.tsx';
import { useHeaderState } from '@/shared/contexts/ToolPageHeaderContext';
import { useHomeNavigation } from '@/shared/hooks/useHomeNavigation';
import { isHomeToolPathActive } from '@/shared/lib/tooling/homeNavigation';
import { useViewportResponsive } from '@/shared/hooks/responsive/useViewportResponsive';
import { cn } from '@/shared/components/ui/contracts/cn';
import { useVideoEditorRouteState } from '@/app/hooks/useVideoEditorRouteState';
import { usePanesStore } from '@/shared/state/panesStore';
import { usePaneControlsHosted } from '@/shared/state/paneControlsHost';
import { TOOL_ROUTES } from '@/shared/lib/tooling/toolRoutes';

interface LayoutMainContentProps {
  isMobileSplitView: boolean;
}

export function LayoutMainContent(props: LayoutMainContentProps) {
  const { isMobileSplitView } = props;
  const { pathname } = useLocation();
  const { isEditorRoute, isVideoEditorShellActive } = useVideoEditorRouteState();
  const isFullEditorSurface = isVideoEditorShellActive;
  const { navigateHome, targetPath } = useHomeNavigation();
  const isEditorPaneLocked = usePanesStore((state) => state.isEditorPaneLocked);
  const effectiveEditorPaneHeight = usePanesStore((state) => state.effectiveEditorPaneHeight);
  const isTasksPaneLocked = usePanesStore((state) => state.isTasksPaneLocked);
  const tasksPaneWidth = usePanesStore((state) => state.tasksPaneWidth);
  const isShotsPaneLocked = usePanesStore((state) => state.isShotsPaneLocked);
  const shotsPaneWidth = usePanesStore((state) => state.shotsPaneWidth);
  const isGenerationsPaneLocked = usePanesStore((state) => state.isGenerationsPaneLocked);
  const isGenerationsPaneOpen = usePanesStore((state) => state.isGenerationsPaneOpen);
  const effectiveGenerationsPaneHeight = usePanesStore((state) => state.effectiveGenerationsPaneHeight);
  // A page that hosts the pane entry points gets the gallery as a sheet over it, not a pane that pushes it up.
  const paneControlsHosted = usePaneControlsHosted();
  const { header, globalHeaderContent } = useHeaderState();
  const { isSm, isMd, isLg, isXl, is2Xl, contentWidth, contentHeight } = useViewportResponsive();

  const containerPadding = isLg ? 'px-6' : isSm ? 'px-4' : 'px-2';
  const containerSpacing = 'py-1';
  const isImageGenerationPage = pathname === TOOL_ROUTES.IMAGE_GENERATION;

  // A locked Tasks pane is a fixed column at the right edge. The page and the header both reserve its width so
  // the header's right-side controls (Settings) stay clickable beside the pane rather than under it.
  const tasksPaneReserve = isTasksPaneLocked ? `${tasksPaneWidth}px` : '0px';

  const contentStyle = {
    marginRight: tasksPaneReserve,
    marginLeft: isShotsPaneLocked ? `${shotsPaneWidth}px` : '0px',
    paddingTop: isEditorPaneLocked && isVideoEditorShellActive ? `${effectiveEditorPaneHeight}px` : '0px',
    paddingBottom: isMobileSplitView || isImageGenerationPage || paneControlsHosted
      ? '0px'
      : ((isGenerationsPaneLocked || isGenerationsPaneOpen) ? `${effectiveGenerationsPaneHeight}px` : '0px'),
    '--content-width': `${contentWidth}px`,
    '--content-height': `${contentHeight}px`,
    '--content-sm': isSm ? '1' : '0',
    '--content-md': isMd ? '1' : '0',
    '--content-lg': isLg ? '1' : '0',
    '--content-xl': isXl ? '1' : '0',
    '--content-2xl': is2Xl ? '1' : '0',
    willChange: 'margin, padding',
  } as CSSProperties;

  return <AppMainContent
    headerContent={globalHeaderContent}
    toolHeader={header}
    tasksPaneReserve={tasksPaneReserve}
    contentStyle={contentStyle}
    isEditorRoute={isEditorRoute}
    isFullEditorSurface={isFullEditorSurface}
    navigationMode={isHomeToolPathActive(pathname, targetPath) ? 'tools' : 'home'}
    onNavigate={isEditorRoute ? undefined : navigateHome}
    showProjectControls={!isEditorRoute}
    nonEditorMainClassName={cn('container mx-auto', containerPadding, containerSpacing)}
  ><Outlet /></AppMainContent>;
}
