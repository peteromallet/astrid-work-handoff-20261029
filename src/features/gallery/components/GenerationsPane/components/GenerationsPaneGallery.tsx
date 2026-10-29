import React from 'react';
import type { Shot } from '@/domains/generation/types';
import { MediaGallery, type GalleryFilterState } from '@/shared/components/MediaGallery';
import type { GalleryConfig } from '@/shared/components/MediaGallery/types';
import { useShots } from '@/shared/contexts/ShotsContext';
import { SelectionContextMenu } from '@/shared/components/SelectionContextMenu';
import { SkeletonGallery } from '@/shared/components/ui/composed/skeleton-gallery';
import { useShotNavigation } from '@/shared/hooks/shots/useShotNavigation';
import { VideoGenerationModal } from '@/tools/travel-between-images/components/VideoGenerationModal';
import { useLassoSelection } from '../hooks/useLassoSelection';
import { GenerationsPaneEmptyState } from './GenerationsPaneEmptyState';
import { useRenderBudget } from '@/shared/dev/useRenderBudget';
import { RuntimeAuthorityProvider } from '@/app/runtime/RuntimeAuthorityProvider';
import {
  userSelectGalleryItem,
  userSelectGalleryItems,
  useGallerySelection,
} from '@/shared/state/selectionStore';

type MediaGalleryProps = React.ComponentProps<typeof MediaGallery>;

const ADD_TO_TIMELINE_MISMATCH_REASON = "This gallery's project is not the selected editor's project";

interface GenerationsPaneLayoutModel {
  cols: number;
  rows: number;
  itemsPerPage: number;
  /** Grid width when tiles were shrunk to fit the pane cap; undefined fills the container. */
  gridWidth?: number;
}

interface GenerationsPaneLoadingModel {
  isLoading: boolean;
}

interface GenerationsPanePageModel {
  page: number;
  totalCount: number;
}

interface GenerationsPaneGalleryModel {
  runtimeProjectId: string | null;
  runtimeAuthority: boolean;
  items: MediaGalleryProps['images'];
  allShots: NonNullable<MediaGalleryProps['allShots']>;
  lastShotId?: string;
  filters: GalleryFilterState;
  onFiltersChange: (newFilters: GalleryFilterState) => void;
  onAddToShot: NonNullable<MediaGalleryProps['onAddToLastShot']>;
  onAddToShotWithoutPosition: NonNullable<MediaGalleryProps['onAddToLastShotWithoutPosition']>;
  onServerPageChange: NonNullable<
    NonNullable<MediaGalleryProps['pagination']>['onServerPageChange']
  >;
  generationFilters: MediaGalleryProps['generationFilters'];
  currentViewingShotId?: string;
  onAddGenerationToTimeline?: (generationId: string) => void;
  /** The selected editor belongs to another project than this gallery, so adding to it is refused. */
  addTargetProjectMismatch?: boolean;
  config?: Partial<GalleryConfig>;
  readOnly?: boolean;
  emptyState: { message: string; onShowEverything?: () => void };
}

interface GenerationsPaneGalleryProps {
  containerRef: React.Ref<HTMLDivElement>;
  projectAspectRatio?: string;
  layout: GenerationsPaneLayoutModel;
  loading: GenerationsPaneLoadingModel;
  pagination: GenerationsPanePageModel;
  error: Error | null;
  gallery: GenerationsPaneGalleryModel;
}

export function GenerationsPaneGallery({
  containerRef,
  projectAspectRatio,
  layout,
  loading,
  pagination,
  error,
  gallery,
}: GenerationsPaneGalleryProps): React.ReactElement {
  useRenderBudget('GenerationsPaneGallery', 5);
  const gallerySurfaceRef = React.useRef<HTMLDivElement | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = React.useState<{ x: number; y: number } | null>(null);
  const [videoModalShot, setVideoModalShot] = React.useState<Shot | null>(null);
  const {
    selectedGalleryIds,
    gallerySelectionMap,
  } = useGallerySelection();
  const { shots } = useShots();
  const { navigateToShot } = useShotNavigation();
  const { selectionRect, handleMouseDown } = useLassoSelection({
    containerRef: gallerySurfaceRef,
    items: gallery.items,
    onSelectItems: (items, options) => {
      userSelectGalleryItems(items, { additive: options?.additive ?? false });
    },
  });

  const buildSelectionMeta = React.useCallback((image: MediaGalleryProps['images'][number]) => ({
    url: image.url ?? image.thumbUrl ?? '',
    type: image.type ?? image.contentType ?? (image.isVideo ? 'video/mp4' : 'image/png'),
    generationId: image.generation_id ?? image.id,
    variantId: image.primary_variant_id,
  }), []);

  const handleImageClick = React.useCallback((
    image: MediaGalleryProps['images'][number],
    modifiers?: { multiSelect: boolean },
  ) => {
    userSelectGalleryItem({
      id: image.id,
      ...buildSelectionMeta(image),
    }, { additive: modifiers?.multiSelect ?? false });
  }, [buildSelectionMeta]);

  const resolveSelectedGenerationIds = React.useCallback(() => (
    Array.from(gallerySelectionMap.values()).map((entry) => entry.generationId)
  ), [gallerySelectionMap]);

  const selectedGenerationIds = React.useMemo(() => resolveSelectedGenerationIds(), [resolveSelectedGenerationIds]);

  const existingShotsForSelection = React.useMemo(() => {
    if (selectedGenerationIds.length === 0 || !shots?.length) {
      return [] as Shot[];
    }

    return shots.filter((shot) => {
      const shotGenerationIds = new Set(
        (shot.images ?? [])
          .map((image) => image.generation_id)
          .filter((generationId): generationId is string => typeof generationId === 'string' && generationId.length > 0),
      );

      return selectedGenerationIds.every((generationId) => shotGenerationIds.has(generationId));
    });
  }, [selectedGenerationIds, shots]);

  const handleContextMenu = React.useCallback((
    event: React.MouseEvent,
    image: MediaGalleryProps['images'][number],
  ) => {
    event.preventDefault();
    if (!selectedGalleryIds.has(image.id)) {
      userSelectGalleryItem({
        id: image.id,
        ...buildSelectionMeta(image),
      }, { additive: false });
    }
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
  }, [buildSelectionMeta, selectedGalleryIds]);

  const handleNavigateToShot = React.useCallback((shot: Shot) => {
    navigateToShot(shot, { isNewlyCreated: true });
  }, [navigateToShot]);

  const handleOpenGenerateVideo = React.useCallback((shot: Shot) => {
    setVideoModalShot(shot);
  }, []);

  return (
    <>
      <div
        ref={containerRef}
        className="flex-grow px-1 sm:px-3 pt-2 pb-2 overflow-y-auto overscroll-contain flex flex-col"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {loading.isLoading && gallery.items.length === 0 && (
          <div style={{ width: layout.gridWidth, marginInline: 'auto' }}>
            <SkeletonGallery
              count={layout.cols * layout.rows}
              fixedColumns={layout.cols}
              gapClasses="gap-2 sm:gap-4"
              darkSurface
              showControls={false}
              projectAspectRatio={projectAspectRatio}
              className="space-y-0"
            />
          </div>
        )}

        {error && <p className="text-red-500 text-center">Error: {error.message}</p>}

        {gallery.items.length > 0 && (
          <div className={loading.isLoading ? 'opacity-60 pointer-events-none transition-opacity duration-200' : ''}>
            <div
              ref={gallerySurfaceRef}
              className="relative"
              style={{ width: layout.gridWidth, marginInline: 'auto' }}
              onMouseDown={handleMouseDown}
            >
              <RuntimeAuthorityProvider value={{
                runtimeProjectId: gallery.runtimeProjectId,
                runtimeAuthority: gallery.runtimeAuthority,
              }}>
                <MediaGallery
                  images={gallery.items}
                  allShots={gallery.allShots}
                  lastShotId={gallery.lastShotId}
                  filters={gallery.filters}
                  onFiltersChange={gallery.onFiltersChange}
                  columnsPerRow={layout.cols}
                  onImageClick={handleImageClick}
                  onContextMenu={gallery.readOnly ? undefined : handleContextMenu}
                  onAddToTimeline={gallery.onAddGenerationToTimeline}
                  addToTimelineDisabledReason={gallery.addTargetProjectMismatch ? ADD_TO_TIMELINE_MISMATCH_REASON : undefined}
                  onAddToLastShot={gallery.onAddToShot}
                  onAddToLastShotWithoutPosition={gallery.onAddToShotWithoutPosition}
                  className="space-y-0"
                  selectedIds={selectedGalleryIds}
                  config={{
                    darkSurface: true,
                    reducedSpacing: true,
                    hidePagination: true,
                    hideTopFilters: true,
                    enableSingleClick: true,
                    ...gallery.config,
                  }}
                  pagination={{
                    offset: (pagination.page - 1) * layout.itemsPerPage,
                    totalCount: pagination.totalCount,
                    itemsPerPage: layout.itemsPerPage,
                    serverPage: pagination.page,
                    onServerPageChange: gallery.onServerPageChange,
                  }}
                  generationFilters={gallery.generationFilters}
                  currentViewingShotId={gallery.currentViewingShotId}
                />
              </RuntimeAuthorityProvider>
              {selectionRect && (
                <div
                  className="pointer-events-none absolute border border-sky-400 bg-sky-400/10"
                  style={{
                    left: selectionRect.left,
                    top: selectionRect.top,
                    width: selectionRect.width,
                    height: selectionRect.height,
                  }}
                />
              )}
            </div>
          </div>
        )}

        {gallery.items.length === 0 && !loading.isLoading && !error && (
          <GenerationsPaneEmptyState
            message={gallery.emptyState.message}
            onShowEverything={gallery.emptyState.onShowEverything}
          />
        )}
      </div>

      {/* Several rapid timeline adds would overwrite each other's ADD_GENERATION_QUERY_PARAM navigation,
          so the menu adds only a single selected item. */}
      {!gallery.readOnly && (
        <SelectionContextMenu
          position={contextMenuPosition}
          onClose={() => setContextMenuPosition(null)}
          onNavigateToShot={handleNavigateToShot}
          onOpenGenerateVideo={handleOpenGenerateVideo}
          existingShots={existingShotsForSelection}
          onAddToTimeline={gallery.onAddGenerationToTimeline && selectedGenerationIds.length === 1
            ? () => gallery.onAddGenerationToTimeline?.(selectedGenerationIds[0])
            : undefined}
          addToTimelineDisabledReason={gallery.addTargetProjectMismatch ? ADD_TO_TIMELINE_MISMATCH_REASON : undefined}
        />
      )}

      {videoModalShot && (
        <>
          {/* VideoGenerationModal only uses app-wide providers, so it can open from gallery selection flow. */}
          <VideoGenerationModal
            isOpen={true}
            onClose={() => setVideoModalShot(null)}
            shot={videoModalShot}
          />
        </>
      )}
    </>
  );
}
