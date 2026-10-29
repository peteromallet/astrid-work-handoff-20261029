import type { CSSProperties, ReactNode } from 'react';
import { AppHeader, type AppHeaderNavigationMode } from '@/shared/components/AppHeader.tsx';
import { cn } from '@/shared/components/ui/contracts/cn';

interface AppMainContentProps {
  headerContent: ReactNode;
  toolHeader?: ReactNode;
  tasksPaneReserve: string;
  contentStyle: CSSProperties;
  isEditorRoute: boolean;
  isFullEditorSurface: boolean;
  navigationMode: AppHeaderNavigationMode;
  onNavigate?: () => void;
  showProjectControls: boolean;
  settingsDisabled?: boolean;
  nonEditorMainClassName: string;
  children: ReactNode;
  mainLabel?: string;
}

/** Shared global header slot and route content geometry from the app shell. */
export function AppMainContent({
  headerContent,
  toolHeader,
  tasksPaneReserve,
  contentStyle,
  isEditorRoute,
  isFullEditorSurface,
  navigationMode,
  onNavigate,
  showProjectControls,
  settingsDisabled,
  nonEditorMainClassName,
  children,
  mainLabel,
}: AppMainContentProps) {
  return (
    <>
      <div
        className="transition-[margin] duration-300 ease-smooth"
        style={{ marginRight: tasksPaneReserve, willChange: 'margin' }}
        data-testid="global-header-slot"
      >
        <AppHeader
          navigationMode={navigationMode}
          onNavigate={onNavigate}
          navigationControls={headerContent}
          showProjectControls={showProjectControls}
          settingsDisabled={settingsDisabled}
        />
      </div>

      <div
        className={cn(
          'relative z-10 content-container',
          isFullEditorSurface
            ? 'min-h-0 flex-1 overflow-hidden transition-[margin,padding] duration-300 ease-smooth'
            : 'transition-[margin,padding] duration-300 ease-smooth',
        )}
        data-video-editor-route={isEditorRoute ? 'true' : 'false'}
        data-video-editor-shell-active={isFullEditorSurface ? 'true' : 'false'}
        style={contentStyle}
      >
        <main
          className={cn(isFullEditorSurface ? 'h-full w-full overflow-hidden' : nonEditorMainClassName)}
          aria-label={mainLabel}
        >
          {!isFullEditorSurface && toolHeader}
          {children}
        </main>
      </div>
    </>
  );
}
