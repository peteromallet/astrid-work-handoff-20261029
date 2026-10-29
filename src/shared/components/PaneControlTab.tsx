import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { LockIcon, UnlockIcon, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Square, LayoutGrid, Images, ListTodo } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { useIsMobile, useIsTablet } from '@/shared/hooks/mobile';
import { PANE_CONFIG, PaneSide, PanePosition } from '@/shared/config/panes';
import { usePositionStrategy } from '@/shared/hooks/panePositioning/usePositionStrategy';
import { safeAreaCalc } from '@/shared/lib/safeArea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { useAppEventListener } from '@/shared/lib/typedEvents';
import { UI_Z_LAYERS } from '@/shared/lib/uiLayers';
import { usePaneControlsHosted } from '@/shared/state/paneControlsHost';

// Icon type for pane controls
type PaneIconType = 'chevron' | 'tools' | 'gallery' | 'tasks';

// Button types that can appear in the control
type ButtonType = 'third' | 'fourth' | 'lock' | 'unlock' | 'open' | 'composer';

interface PaneControlPosition {
  side: PaneSide;
  paneDimension: number;
  bottomOffset?: number;
  horizontalOffset?: number;
}

interface PaneControlState {
  isLocked: boolean;
  isOpen: boolean;
}

interface PaneControlHandlers {
  toggleLock: (force?: boolean) => void;
  openPane: () => void;
  handlePaneEnter: () => void;
  handlePaneLeave: () => void;
  customOpenAction?: () => void;
}

interface PaneControlDisplay {
  paneIcon?: PaneIconType;
  customIcon?: React.ReactNode;
  paneTooltip?: string;
  allowMobileLock?: boolean;
  /** Keyboard shortcut hint shown in lock/unlock tooltips, e.g. "⌥W" */
  shortcutHint?: string;
}

interface PaneControlAction {
  onClick: () => void;
  ariaLabel: string;
  content?: React.ReactNode;
  tooltip?: string;
}

interface PaneControlTabProps {
  position: PaneControlPosition;
  state: PaneControlState;
  handlers: PaneControlHandlers;
  display?: PaneControlDisplay;
  actions?: {
    thirdButton?: PaneControlAction;
    fourthButton?: PaneControlAction;
    /** Opens the agent message composer; hidden while the pane is locked. */
    composerButton?: PaneControlAction & {
      /** A second control shown as a small bubble in the cell's top-right corner on hover (chat voice, when it is on). */
      secondary?: PaneControlAction;
    };
  };
}

// Helper component to wrap buttons in tooltips (desktop only)
const TooltipButton: React.FC<{
  tooltip?: string;
  children: React.ReactNode;
  showTooltip: boolean;
  side?: 'top' | 'bottom' | 'left' | 'right';
}> = ({ tooltip, children, showTooltip, side = 'right' }) => {
  if (!tooltip || !showTooltip) {
    return <>{children}</>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
};

const PaneControlTab: React.FC<PaneControlTabProps> = ({
  position: { side, paneDimension, bottomOffset = 0, horizontalOffset = 0 },
  state: { isLocked, isOpen },
  handlers: { toggleLock, openPane, handlePaneEnter, handlePaneLeave, customOpenAction },
  display: { paneIcon = 'chevron', customIcon, paneTooltip, allowMobileLock = false, shortcutHint } = {},
  actions,
}) => {
  const thirdButton = actions?.thirdButton;
  const fourthButton = actions?.fourthButton;
  const composerButton = actions?.composerButton;
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const handleOpen = customOpenAction ?? openPane;
  const useDesktopBehavior = !isMobile || isTablet;
  const [selectionActive, setSelectionActive] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const paneControlsHosted = usePaneControlsHosted();
  const isBottom = side === 'bottom' || side === 'top';
  const showTooltips = !isMobile;
  const tooltipSide = side === 'left' ? 'right' : side === 'right' ? 'left' : side === 'top' ? 'bottom' : 'top';

  // Event handlers
  const handleButtonClick = React.useCallback((callback: () => void) => {
    return (e: React.PointerEvent | React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      e.preventDefault();
      callback();
    };
  }, []);

  const containerEventHandlers = {
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); },
    onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); e.preventDefault(); },
    onTouchStart: (e: React.TouchEvent) => { e.stopPropagation(); e.preventDefault(); },
    onTouchEnd: (e: React.TouchEvent) => { e.stopPropagation(); e.preventDefault(); },
  };

  // Listen for selection events to hide controls
  const handleSelectionActive = React.useCallback((detail: boolean) => setSelectionActive(!!detail), []);
  useAppEventListener('mobileSelectionActive', handleSelectionActive);

  // Position calculation
  const isVisible = isLocked || (isOpen && !isLocked);
  const position: PanePosition = {
    side,
    dimension: paneDimension,
    offsets: { bottom: bottomOffset, horizontal: horizontalOffset },
    isVisible,
  };
  const dynamicStyle = usePositionStrategy(position);

  // Icon helpers
  const iconSize = isMobile ? "h-5 w-5" : "h-4 w-4";
  const buttonSize = isMobile ? "h-9 w-9" : "h-8 w-8";

  const getIcon = () => {
    if (customIcon) return customIcon;
    if (paneIcon !== 'chevron') {
      switch (paneIcon) {
        case 'tools': return <LayoutGrid className={iconSize} />;
        case 'gallery': return <Images className={iconSize} />;
        case 'tasks': return <ListTodo className={iconSize} />;
      }
    }
    switch (side) {
      case 'left': return <ChevronRight className={iconSize} />;
      case 'right': return <ChevronLeft className={iconSize} />;
      case 'bottom': return <ChevronUp className={iconSize} />;
      case 'top': return <ChevronDown className={iconSize} />;
      default: return null;
    }
  };

  // ==========================================================================
  // BUTTON CONFIGURATION - Determines which buttons show based on state
  // ==========================================================================
  const getButtonsToShow = (): ButtonType[] => {
    // Mobile behavior
    if (!useDesktopBehavior) {
      // Left/Right panes on mobile: thirdButton + optional splitButton (only when not locked)
      if (!isBottom) {
        const buttons: ButtonType[] = [];
        if (thirdButton) buttons.push('third');
        if (composerButton && !isLocked) buttons.push('composer');
        return buttons;
      }
      // Bottom pane on mobile with allowMobileLock
      if (allowMobileLock) {
        if (isLocked) return ['third', 'unlock', 'fourth'];
        if (isOpen) return ['third', 'lock', 'fourth'];
        return ['third', 'lock', 'open'];
      }
      // Bottom pane on mobile without allowMobileLock
      if (isOpen) return []; // Hide when open
      return ['third', 'open', 'fourth'];
    }

    // Desktop behavior
    if (isLocked) {
      // Locked: never show the composer button (chat is already visible in the pane)
      return isBottom ? ['third', 'unlock', 'fourth'] : ['third', 'unlock'];
    }
    if (isOpen) {
      const buttons: ButtonType[] = isBottom ? ['third', 'lock', 'fourth'] : ['third', 'lock'];
      if (composerButton && !isBottom) buttons.push('composer');
      return buttons;
    }
    // Closed
    if (side === 'top') return ['third', 'lock'];
    if (isBottom) return ['third', 'lock', 'open'];
    const closedSideButtons: ButtonType[] = ['third', 'lock'];
    if (composerButton) closedSideButtons.push('composer');
    return closedSideButtons;
  };

  // ==========================================================================
  // RENDER HELPERS
  // ==========================================================================
  const renderButton = (type: ButtonType) => {
    const baseClass = `${buttonSize} text-muted-foreground hover:text-foreground hover:bg-accent`;

    switch (type) {
      case 'third':
        if (!thirdButton) return null;
        return (
          <TooltipButton key="third" tooltip={thirdButton.tooltip} showTooltip={showTooltips} side={tooltipSide}>
            <Button
              variant="ghost"
              size="icon"
              onPointerUp={handleButtonClick(thirdButton.onClick)}
              onClick={(e) => e.stopPropagation()}
              className={baseClass}
              aria-label={thirdButton.ariaLabel}
            >
              {thirdButton.content || <Square className={iconSize} />}
            </Button>
          </TooltipButton>
        );

      case 'fourth':
        if (!fourthButton) return null;
        return (
          <TooltipButton key="fourth" tooltip={fourthButton.tooltip} showTooltip={showTooltips} side={tooltipSide}>
            <Button
              variant="ghost"
              size="icon"
              onPointerUp={handleButtonClick(fourthButton.onClick)}
              onClick={(e) => e.stopPropagation()}
              className={baseClass}
              aria-label={fourthButton.ariaLabel}
            >
              {fourthButton.content || <Square className={iconSize} />}
            </Button>
          </TooltipButton>
        );

      case 'lock':
        return (
          <TooltipButton key="lock" tooltip={shortcutHint ? `Lock pane open (${shortcutHint})` : 'Lock pane open'} showTooltip={showTooltips} side={tooltipSide}>
            <Button
              variant="ghost"
              size="icon"
              onPointerUp={handleButtonClick(() => toggleLock(true))}
              onClick={(e) => e.stopPropagation()}
              className={baseClass}
              aria-label="Lock pane"
            >
              <LockIcon className={iconSize} />
            </Button>
          </TooltipButton>
        );

      case 'unlock':
        return (
          <TooltipButton key="unlock" tooltip={shortcutHint ? `Unlock pane (${shortcutHint})` : 'Unlock pane'} showTooltip={showTooltips} side={tooltipSide}>
            <Button
              variant="ghost"
              size="icon"
              onPointerUp={handleButtonClick(() => toggleLock(false))}
              onClick={(e) => e.stopPropagation()}
              className={baseClass}
              aria-label="Unlock pane"
            >
              <UnlockIcon className={iconSize} />
            </Button>
          </TooltipButton>
        );

      case 'open':
        return (
          <TooltipButton key="open" tooltip={paneTooltip} showTooltip={showTooltips} side={tooltipSide}>
            <Button
              variant="ghost"
              size="icon"
              onPointerUp={handleButtonClick(handleOpen)}
              onClick={(e) => e.stopPropagation()}
              className={baseClass}
              aria-label={paneTooltip || "Open pane"}
            >
              {getIcon()}
            </Button>
          </TooltipButton>
        );

      case 'composer': {
        if (!composerButton) return null;
        const { secondary } = composerButton;
        const primaryButton = (
          <TooltipButton
            key="composer"
            tooltip={composerButton.tooltip}
            showTooltip={showTooltips}
            side={tooltipSide}
          >
            <Button
              variant="ghost"
              size="icon"
              onPointerUp={handleButtonClick(composerButton.onClick)}
              onClick={(e) => e.stopPropagation()}
              className={cn(baseClass, 'rounded')}
              aria-label={composerButton.ariaLabel}
            >
              {composerButton.content}
            </Button>
          </TooltipButton>
        );
        if (!secondary) return primaryButton;
        return (
          <div key="composer" className={cn('group relative', buttonSize)}>
            {primaryButton}
            <TooltipButton tooltip={secondary.tooltip} showTooltip={showTooltips} side={tooltipSide}>
              <Button
                variant="ghost"
                size="icon"
                onPointerUp={handleButtonClick(secondary.onClick)}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  'absolute -top-1.5 -right-1.5 h-4 w-4 p-0 rounded-full',
                  'bg-secondary border border-border text-secondary-foreground hover:bg-accent hover:text-foreground',
                  'opacity-0 transition-opacity duration-150',
                  'group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100',
                )}
                aria-label={secondary.ariaLabel}
              >
                {secondary.content}
              </Button>
            </TooltipButton>
          </div>
        );
      }

      default:
        return null;
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  // Hide on mobile when selection is active
  if (!useDesktopBehavior && selectionActive) return null;
  // The page's own layout carries the entry points (see paneControlsHost.ts).
  if (paneControlsHosted) return null;

  const buttons = getButtonsToShow();

  // Nothing to show
  if (buttons.length === 0) return null;

  // Container styling
  // TasksPane (right side) should appear above MediaLightbox on iPad/desktop
  // but behind the lightbox on mobile phones for cleaner full-screen lightbox experience
  const isTasksPane = side === 'right';
  const isMobilePhone = isMobile && !isTablet;
  const tasksPaneZIndex = isMobilePhone
    ? UI_Z_LAYERS.TASKS_PANE_TAB_BEHIND_LIGHTBOX
    : UI_Z_LAYERS.TASKS_PANE_TAB_ABOVE_LIGHTBOX;
  const normalLockedZIndex = PANE_CONFIG.zIndex.CONTROL_LOCKED;
  const normalUnlockedZIndex = PANE_CONFIG.zIndex.CONTROL_UNLOCKED;

  const zIndexClass = isTasksPane
    ? ''
    : (isLocked || (isOpen && !isLocked) ? normalLockedZIndex : normalUnlockedZIndex);

  // The tab is a small panel in the theme's own colours, light by day and dark by night.
  const bgOpacity = isLocked || (isOpen && !isLocked) ? 'bg-card/95' : 'bg-card/85';
  const transition = isLocked || (isOpen && !isLocked)
    ? PANE_CONFIG.transition.PROPERTIES.TRANSFORM_ONLY
    : PANE_CONFIG.transition.PROPERTIES.TRANSFORM_OPACITY;

  const positionClasses = (() => {
    switch (side) {
      case 'left': return 'left-0 flex-col';
      case 'right': return 'right-0 flex-col';
      case 'bottom': return 'left-1/2 -translate-x-1/2 bottom-0 flex-row';
      case 'top': return 'left-1/2 -translate-x-1/2 top-0 flex-row';
      default: return '';
    }
  })();

  // On mobile, left/right panes only show one button - make them taller for easier tapping
  const isMobileSidePane = !useDesktopBehavior && !isBottom && buttons.length === 1;

  // Add safe area margin for iOS home indicator on touch devices
  // Only when the pane is NOT visible - when visible, the control sits on the pane, not at screen edge
  const needsSafeAreaMargin = isMobile && isBottom && !isVisible;
  const mobileStyle = needsSafeAreaMargin ? {
    ...dynamicStyle,
    marginBottom: safeAreaCalc.marginBottom(0.5),
  } : dynamicStyle;

  // The Tasks/chat and gallery tabs rest as slim grips in the gutter beside the pane so they
  // cover none of the page; hover or keyboard focus expands them to the full tab.
  const restsAsGrip = !isMobile && (
    (isTasksPane && !(isOpen && !isLocked))
    || (side === 'bottom' && !isVisible)
  );
  const gripResting = restsAsGrip && !hovered && !focused;

  const content = (
    <div
      data-pane-control
      data-pane-control-grip={gripResting ? 'true' : undefined}
      data-pane-control-side={side}
      style={{
        ...mobileStyle,
        ...(isTasksPane ? { zIndex: tasksPaneZIndex } : {}),
      }}
      className={cn(
        `fixed ${zIndexClass} flex items-center p-1 backdrop-blur-sm border border-border shadow-sm rounded-md gap-1 duration-${PANE_CONFIG.timing.ANIMATION_DURATION} ${PANE_CONFIG.transition.EASING}`,
        bgOpacity,
        transition,
        positionClasses,
        'opacity-100 touch-none',
        // Taller touch target for mobile side panes with single button
        isMobileSidePane && 'min-h-[72px] justify-center',
        gripResting && 'justify-center overflow-hidden !p-0 [&>button]:opacity-0 [&>div]:opacity-0',
        gripResting && (isBottom ? 'h-[10px] w-12' : 'h-12 w-[10px]'),
      )}
      onMouseEnter={() => {
        if (restsAsGrip) setHovered(true);
        if (useDesktopBehavior && isOpen && !isLocked) handlePaneEnter();
      }}
      onMouseLeave={() => {
        if (restsAsGrip) setHovered(false);
        if (useDesktopBehavior && isOpen && !isLocked) handlePaneLeave();
      }}
      onFocus={restsAsGrip ? () => setFocused(true) : undefined}
      onBlur={restsAsGrip ? () => setFocused(false) : undefined}
      {...containerEventHandlers}
    >
      {gripResting && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute rounded-full bg-muted-foreground/60',
            isBottom
              ? 'inset-x-3 top-1/2 h-[2px] -translate-y-1/2'
              : 'inset-y-3 left-1/2 w-[2px] -translate-x-1/2',
          )}
        />
      )}
      {buttons.map(renderButton)}
    </div>
  );

  return content;
};

export { PaneControlTab };
