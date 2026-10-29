import { useState, useEffect } from "react";
import type { GeneratedImageWithMetadata } from "../../MediaGallery/types";

interface UseMediaGalleryItemStateProps {
  image: GeneratedImageWithMetadata;
}

interface UseMediaGalleryItemStateReturn {
  // Star state
  localStarred: boolean;
  setLocalStarred: (starred: boolean) => void;
  isTogglingStar: boolean;
  setIsTogglingStar: (toggling: boolean) => void;

  // UI state
  isInfoOpen: boolean;
  setIsInfoOpen: (open: boolean) => void;
  isShotSelectorOpen: boolean;
  setIsShotSelectorOpen: (open: boolean) => void;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
  settingsApplied: boolean;
  setSettingsApplied: (applied: boolean) => void;
}

/**
 * Hook to consolidate local UI state for MediaGalleryItem
 */
export function useMediaGalleryItemState({
  image,
}: UseMediaGalleryItemStateProps): UseMediaGalleryItemStateReturn {
  // Star state
  const [isTogglingStar, setIsTogglingStar] = useState<boolean>(false);
  const [localStarred, setLocalStarred] = useState<boolean>(image.starred ?? false);

  // Sync local starred state when image changes or when image.starred updates from parent
  useEffect(() => {
    setLocalStarred(image.starred ?? false);
  }, [image.id, image.starred]);

  // UI state
  const [isInfoOpen, setIsInfoOpen] = useState<boolean>(false);
  const [isShotSelectorOpen, setIsShotSelectorOpen] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [settingsApplied, setSettingsApplied] = useState<boolean>(false);

  return {
    // Star state
    localStarred,
    setLocalStarred,
    isTogglingStar,
    setIsTogglingStar,

    // UI state
    isInfoOpen,
    setIsInfoOpen,
    isShotSelectorOpen,
    setIsShotSelectorOpen,
    isDragging,
    setIsDragging,
    settingsApplied,
    setSettingsApplied,
  };
}
