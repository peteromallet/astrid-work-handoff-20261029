import { useState, useCallback, useMemo, useEffect } from 'react';
import { GenerationRow } from '@/domains/generation/types';
import { DerivedNavContext } from '../types';
import { navigateDerivedStep } from '@/shared/lib/navigation/derivedNavigation';

interface UseLightboxProps {
  images: GenerationRow[];
  externalGenerations: GenerationRow[];
  tempDerivedGenerations: GenerationRow[];
  derivedNavContext: DerivedNavContext | null;
  handleOpenExternalGeneration: (generationId: string, derivedContext?: string[]) => Promise<void>;
}

export function useLightbox({
  images,
  externalGenerations,
  tempDerivedGenerations,
  derivedNavContext,
  handleOpenExternalGeneration
}: UseLightboxProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  
  // Combine all images for lightbox navigation
  const currentImages = useMemo(() => {
    const baseImages = (images && images.length > 0) ? images : [];
    return [...baseImages, ...externalGenerations, ...tempDerivedGenerations];
  }, [images, externalGenerations, tempDerivedGenerations]);
  
  // Get current lightbox image
  const currentLightboxImage = lightboxIndex !== null ? currentImages[lightboxIndex] : null;
  
  // Close lightbox if current image no longer exists (e.g., deleted)
  useEffect(() => {
    
    if (lightboxIndex !== null && lightboxIndex >= currentImages.length) {
      setLightboxIndex(null);
    }
  }, [lightboxIndex, currentImages.length, images.length, externalGenerations.length, tempDerivedGenerations.length, derivedNavContext]);
  
  // Handle next navigation
  const handleNext = useCallback(() => {
    if (lightboxIndex === null) return;

    const handledDerivedStep = navigateDerivedStep({
      derivedNavContext,
      lightboxIndex,
      currentImages,
      direction: 'next',
      handleOpenExternalGeneration,
    });

    if (!handledDerivedStep && lightboxIndex < currentImages.length - 1) {
      setLightboxIndex(lightboxIndex + 1);
    }
  }, [lightboxIndex, currentImages, derivedNavContext, handleOpenExternalGeneration]);
  
  // Handle previous navigation
  const handlePrevious = useCallback(() => {
    if (lightboxIndex === null) return;

    const handledDerivedStep = navigateDerivedStep({
      derivedNavContext,
      lightboxIndex,
      currentImages,
      direction: 'prev',
      handleOpenExternalGeneration,
    });

    if (!handledDerivedStep && lightboxIndex > 0) {
      setLightboxIndex(lightboxIndex - 1);
    }
  }, [lightboxIndex, currentImages, derivedNavContext, handleOpenExternalGeneration]);
  
  return {
    lightboxIndex,
    setLightboxIndex,
    currentImages,
    currentLightboxImage,
    handleNext,
    handlePrevious
  };
}
