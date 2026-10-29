/**
 * LightboxLayout - Unified layout for all lightbox configurations.
 *
 * Sub-components call context hooks directly instead of receiving a bundled model object.
 * Layout-derived values (computed from props + context) use the small useLightboxLayoutComputed hook.
 */

import React from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';
import type { LightboxLayoutProps } from './types';
import {
  useLightboxCoreSafe,
  useLightboxMediaSafe,
  useLightboxVariantsSafe,
  useLightboxNavigationSafe,
} from '../../contexts/LightboxStateContext';
import { VariantOverlayBadge } from './VariantOverlayBadge';
import { AdjacentSegmentNavigation } from './AdjacentSegmentNavigation';
import { PreviewSequencePill } from './PreviewSequencePill';
import { ConstituentImageNavigation } from './ConstituentImageNavigation';
import { NavigationArrows } from '../NavigationArrows';
import {
  TopRightControls,
  BottomRightControls,
} from '../ButtonGroups';
import { MediaDisplayWithCanvas } from '../MediaDisplayWithCanvas';
import { WorkflowControlsBar } from '../WorkflowControlsBar';
import { resolveVariantThumbnailUrl } from '../../utils/variantThumbnail';

/** Derives layout flags from props + core context. Used by components that need layout-aware rendering. */
function useLightboxLayoutComputed(props: Pick<LightboxLayoutProps, 'showPanel' | 'shouldShowSidePanel'>) {
  const isSidePanelLayout = props.showPanel && props.shouldShowSidePanel;
  const isStackedLayout = props.showPanel && !props.shouldShowSidePanel;
  const mediaDisplayVariant: 'desktop-side-panel' | 'mobile-stacked' | 'regular-centered' = props.showPanel
    ? (isSidePanelLayout ? 'desktop-side-panel' : 'mobile-stacked')
    : 'regular-centered';
  const mediaDisplayContainerClassName = isSidePanelLayout
    ? 'max-w-full max-h-full'
    : 'w-full h-full';
  const mediaDisplayDebugContext = props.showPanel
    ? (isSidePanelLayout ? 'Desktop' : 'Mobile Stacked')
    : 'Regular Centered';
  const topCenterClassName = isStackedLayout
    ? 'absolute top-4 md:top-16 left-1/2 transform -translate-x-1/2 z-[60] flex flex-col items-center gap-2'
    : 'absolute top-4 left-1/2 transform -translate-x-1/2 z-[60] flex flex-col items-center gap-2';

  return {
    isSidePanelLayout,
    isStackedLayout,
    mediaDisplayVariant,
    mediaDisplayContainerClassName,
    mediaDisplayDebugContext,
    topCenterClassName,
  };
}

function MediaContent({ layout, effectiveTasksPaneOpen, effectiveTasksPaneWidth }: {
  layout: ReturnType<typeof useLightboxLayoutComputed>;
  effectiveTasksPaneOpen: boolean;
  effectiveTasksPaneWidth: number;
}) {
  const mediaState = useLightboxMediaSafe();
  const variantsState = useLightboxVariantsSafe();
  const variantThumbnailUrl = resolveVariantThumbnailUrl(variantsState.activeVariant, mediaState.media);

  return (
    <MediaDisplayWithCanvas
      effectiveImageUrl={mediaState.isVideo ? mediaState.effectiveVideoUrl : mediaState.effectiveMediaUrl}
      thumbUrl={variantThumbnailUrl}
      isVideo={mediaState.isVideo}
      onImageLoad={mediaState.setImageDimensions}
      variant={layout.mediaDisplayVariant}
      containerClassName={layout.mediaDisplayContainerClassName}
      tasksPaneWidth={layout.isSidePanelLayout && effectiveTasksPaneOpen ? effectiveTasksPaneWidth : 0}
      debugContext={layout.mediaDisplayDebugContext}
      imageDimensions={mediaState.effectiveImageDimensions}
    />
  );
}

function TopCenterOverlay({ className, adjacentSegments, segmentSlotMode }: {
  className: string;
  adjacentSegments?: LightboxLayoutProps['adjacentSegments'];
  segmentSlotMode?: LightboxLayoutProps['segmentSlotMode'];
}) {
  const core = useLightboxCoreSafe();
  const mediaState = useLightboxMediaSafe();
  const variantsState = useLightboxVariantsSafe();

  return (
    <div className={className}>
      {adjacentSegments && !mediaState.isVideo && (
        <AdjacentSegmentNavigation adjacentSegments={adjacentSegments} />
      )}
      {mediaState.isVideo && segmentSlotMode?.adjacentVideoThumbnails && segmentSlotMode?.onOpenPreviewDialog && (
        <PreviewSequencePill
          adjacentVideoThumbnails={segmentSlotMode.adjacentVideoThumbnails}
          onOpenPreviewDialog={segmentSlotMode.onOpenPreviewDialog}
        />
      )}
      <VariantOverlayBadge
        activeVariant={variantsState.activeVariant ?? undefined}
        variants={variantsState.variants}
        readOnly={core.readOnly}
      />
    </div>
  );
}

function OverlayElements({ topCenterClassName, props }: {
  topCenterClassName: string;
  props: LightboxLayoutProps;
}) {
  const buttonGroups = props.buttonGroups;

  return (
    <>
      <TopCenterOverlay
        className={topCenterClassName}
        adjacentSegments={props.adjacentSegments}
        segmentSlotMode={props.segmentSlotMode}
      />

      <BottomRightControls {...buttonGroups.bottomRight} />
      <TopRightControls {...buttonGroups.topRight} />

      {props.segmentSlotMode?.onNavigateToImage && (
        <ConstituentImageNavigation
          startImageId={props.segmentSlotMode.pairData.startImage?.id}
          endImageId={props.segmentSlotMode.pairData.endImage?.id}
          startImageUrl={props.segmentSlotMode.pairData.startImage?.thumbUrl || props.segmentSlotMode.pairData.startImage?.url}
          endImageUrl={props.segmentSlotMode.pairData.endImage?.thumbUrl || props.segmentSlotMode.pairData.endImage?.url}
          onNavigateToImage={props.segmentSlotMode.onNavigateToImage}
          variant="overlay"
        />
      )}

      {props.customOverlay}

      <WorkflowControlsBar {...props.workflowBar} />
    </>
  );
}

function PanelLayoutView({ props }: { props: LightboxLayoutProps }) {
  const core = useLightboxCoreSafe();
  const navigation = useLightboxNavigationSafe();
  const layout = useLightboxLayoutComputed(props);

  const isDesktopPanel = layout.isSidePanelLayout;

  return (
    <div
      data-lightbox-bg
      className={cn('w-full h-full bg-black/90', isDesktopPanel ? 'flex' : 'flex flex-col')}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        data-lightbox-bg
        className={cn('flex items-center justify-center relative overflow-hidden', isDesktopPanel ? 'flex-1 touch-none' : 'flex-none touch-none z-10')}
        style={isDesktopPanel
          ? { width: '60%' }
          : {
              height: '50%',
              transform: navigation.swipeNavigation.isSwiping
                ? `translateX(${navigation.swipeNavigation.swipeOffset}px)`
                : undefined,
              transition: navigation.swipeNavigation.isSwiping ? 'none' : 'transform 0.2s ease-out',
            }}
        onClick={(event) => event.stopPropagation()}
        {...(!isDesktopPanel ? navigation.swipeNavigation.swipeHandlers : {})}
      >
        {isDesktopPanel && (
          <NavigationArrows
            showNavigation={navigation.showNavigation}
            readOnly={core.readOnly}
            onPrevious={navigation.handleSlotNavPrev}
            onNext={navigation.handleSlotNavNext}
            hasPrevious={navigation.hasPrevious}
            hasNext={navigation.hasNext}
            variant="desktop"
          />
        )}

        <MediaContent
          layout={layout}
          effectiveTasksPaneOpen={props.effectiveTasksPaneOpen}
          effectiveTasksPaneWidth={props.effectiveTasksPaneWidth}
        />
        <OverlayElements props={props} topCenterClassName={layout.topCenterClassName} />

        {!isDesktopPanel && (
          <NavigationArrows
            showNavigation={navigation.showNavigation}
            readOnly={core.readOnly}
            onPrevious={navigation.handleSlotNavPrev}
            onNext={navigation.handleSlotNavNext}
            hasPrevious={navigation.hasPrevious}
            hasNext={navigation.hasNext}
            variant="mobile"
          />
        )}
      </div>

      <div
        data-task-details-panel
        className={cn('bg-background overflow-hidden relative z-[60] overscroll-none', isDesktopPanel ? 'border-l border-border h-full' : 'border-t border-border overflow-y-auto')}
        style={isDesktopPanel ? { width: '40%' } : { height: '50%' }}
      >
        {props.controlsPanelContent}
      </div>
    </div>
  );
}

function CenteredLayoutView({ props }: { props: LightboxLayoutProps }) {
  const core = useLightboxCoreSafe();
  const navigation = useLightboxNavigationSafe();
  const layout = useLightboxLayoutComputed(props);


  return (
    <div
      data-lightbox-bg
      className="relative flex flex-col items-center gap-3 sm:gap-4 md:gap-6 px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 w-full h-full touch-none"
      onClick={(event) => event.stopPropagation()}
    >
      <div
        data-lightbox-bg
        className={cn(
          'relative flex items-center justify-center max-w-full my-auto',
          'touch-none'
        )}
        style={{
          height: 'calc(var(--lightbox-available-height, 100dvh) - 220px)',
          maxHeight: '100%',
          transform: navigation.swipeNavigation.isSwiping
            ? `translateX(${navigation.swipeNavigation.swipeOffset}px)`
            : undefined,
          transition: navigation.swipeNavigation.isSwiping ? 'none' : 'transform 0.2s ease-out',
        }}
        onClick={(event) => event.stopPropagation()}
        {...navigation.swipeNavigation.swipeHandlers}
      >
        <MediaContent
          layout={layout}
          effectiveTasksPaneOpen={props.effectiveTasksPaneOpen}
          effectiveTasksPaneWidth={props.effectiveTasksPaneWidth}
        />
        <OverlayElements
          props={props}
          topCenterClassName="absolute top-4 left-1/2 transform -translate-x-1/2 z-[60] flex flex-col items-center gap-2"
        />

        <NavigationArrows
          showNavigation={navigation.showNavigation}
          readOnly={core.readOnly}
          onPrevious={navigation.handleSlotNavPrev}
          onNext={navigation.handleSlotNavNext}
          hasPrevious={navigation.hasPrevious}
          hasNext={navigation.hasNext}
          variant="mobile"
        />
      </div>

    </div>
  );
}

export const LightboxLayout: React.FC<LightboxLayoutProps> = (props) => {
  return props.showPanel
    ? <PanelLayoutView props={props} />
    : <CenteredLayoutView props={props} />;
};
