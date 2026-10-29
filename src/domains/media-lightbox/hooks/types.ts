import type { RefObject } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import type { DerivedItem } from '@/domains/generation/hooks/useDerivedItems';
import type { GenerationVariant } from '@/shared/hooks/variants/useVariants';
import type { LightboxDeleteHandler, LightboxShotWorkflowProps } from '../types';
import type { useSwipeNavigation as UseSwipeNavigationType } from './useSwipeNavigation';

/** Core media and project context */
export interface SharedLightboxCoreProps {
  media: GenerationRow;
  isVideo: boolean;
  selectedProjectId: string | null;
  isMobile: boolean;
  isFormOnlyMode: boolean;
  onClose: () => void;
  readOnly?: boolean;
  variantFetchGenerationId: string | null;
  initialVariantId?: string;
}

/** Navigation state and handlers */
export interface SharedLightboxNavigationProps {
  showNavigation?: boolean;
  hasNext?: boolean;
  hasPrevious?: boolean;
  handleSlotNavNext: () => void;
  handleSlotNavPrev: () => void;
  swipeDisabled: boolean;
}

/** Shot management callbacks and optimistic state */
export interface SharedLightboxShotProps {
  shotId?: string;
  shotWorkflow?: LightboxShotWorkflowProps;
}

/** Layout mode inputs */
export interface SharedLightboxLayoutProps {
  showTaskDetails?: boolean;
}

/** Button group inputs (download and delete) */
export interface SharedLightboxButtonGroupProps {
  isCloudMode: boolean;
  showDownload?: boolean;
  isDownloading: boolean;
  setIsDownloading: (v: boolean) => void;
  onDelete?: LightboxDeleteHandler;
  isDeleting?: string | null;
}

/** Effective media inputs (for computing display URLs/dimensions) */
export interface SharedLightboxMediaProps {
  effectiveImageUrl: string;
  imageDimensions: { width: number; height: number };
  projectAspectRatio?: string;
}

export interface UseSharedLightboxStateInput {
  core: SharedLightboxCoreProps;
  navigation: SharedLightboxNavigationProps;
  shots: SharedLightboxShotProps;
  layout: SharedLightboxLayoutProps;
  actions: SharedLightboxButtonGroupProps;
  media: SharedLightboxMediaProps;
  onOpenExternalGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
}

export interface LightboxButtonGroupProps {
  topRight: {
    showDownload: boolean;
    handleDownload?: () => Promise<void>;
    isDownloading: boolean;
    onDelete?: LightboxDeleteHandler;
    handleDelete?: () => Promise<void>;
    isDeleting?: string | null;
    onClose: () => void;
  };
  bottomRight: {
    handleAddToJoin?: () => void;
    isAddingToJoin?: boolean;
    addToJoinSuccess?: boolean;
    onGoToJoin?: () => void;
  };
}

export interface UseSharedLightboxStateReturn {
  variants: {
    list: GenerationVariant[];
    primaryVariant: GenerationVariant | null;
    activeVariant: GenerationVariant | null;
    isLoading: boolean;
    setActiveVariantId: (id: string) => void;
    refetch: () => void;
    setPrimaryVariant: (id: string) => Promise<void>;
    deleteVariant: (id: string) => Promise<void>;
  };
  intendedActiveVariantIdRef: RefObject<string | null>;
  navigation: {
    safeClose: () => void;
    activateClickShield: () => void;
    swipeNavigation: ReturnType<typeof UseSwipeNavigationType>;
  };
  references: {
    isAddingToJoin: boolean;
    addToJoinSuccess: boolean;
    handleAddToJoin: () => void;
    handleGoToJoin: () => void;
  };
  lineage: {
    derivedItems: DerivedItem[];
    derivedGenerations: GenerationRow[];
    derivedPage: number;
    derivedTotalPages: number;
    paginatedDerived: DerivedItem[];
    setDerivedPage: (page: number) => void;
  };
  shots: {
    isAlreadyPositionedInSelectedShot: boolean;
    isAlreadyAssociatedWithoutPosition: boolean;
    handleAddToShot: () => Promise<void>;
    handleAddToShotWithoutPosition: () => Promise<void>;
  };
  effectiveMedia: {
    videoUrl: string | undefined;
    mediaUrl: string | undefined;
    imageDimensions: { width: number; height: number };
  };
  layout: {
    isTabletOrLarger: boolean;
    isTouchLikeDevice: boolean;
    shouldShowSidePanel: boolean;
    isPortraitMode: boolean;
  };
  buttonGroupProps: LightboxButtonGroupProps;
}
