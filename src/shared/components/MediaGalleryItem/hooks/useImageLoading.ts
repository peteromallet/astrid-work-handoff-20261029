import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getDisplayUrl, stripQueryParameters } from "@/shared/lib/media/mediaUrl";
import { hasLoadedImage, setImageLoadStatus } from "@/shared/lib/preloading";
import type { GeneratedImageWithMetadata } from "../../MediaGallery/types";

interface UseImageLoadingProps {
  image: GeneratedImageWithMetadata;
  displayUrl: string;
  shouldLoad: boolean;
  onImageLoaded?: (id: string) => void;
}

interface UseImageLoadingReturn {
  actualSrc: string | null;
  actualDisplayUrl: string;
  imageLoaded: boolean;
  imageLoading: boolean;
  imageLoadError: boolean;
  handleImageLoad: () => void;
  handleImageError: (e?: React.SyntheticEvent<Element>) => void;
  retryImageLoad: () => void;
  setImageLoading: (loading: boolean) => void;
}

const MAX_RETRIES = 2;

export function useImageLoading({
  image,
  displayUrl,
  shouldLoad,
  onImageLoaded,
}: UseImageLoadingProps): UseImageLoadingReturn {
  const isPreloadedAndCached = hasLoadedImage(image);

  const [imageLoadError, setImageLoadError] = useState<boolean>(false);
  const [imageRetryCount, setImageRetryCount] = useState<number>(0);
  const [imageLoaded, setImageLoaded] = useState<boolean>(isPreloadedAndCached);
  const [imageLoading, setImageLoading] = useState<boolean>(false);
  const [actualSrc, setActualSrc] = useState<string | null>(null);
  const [scheduledRetryAttempt, setScheduledRetryAttempt] = useState<number | null>(null);

  const retryDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryApplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const imageIdentifier = useMemo(() => {
    return `${image.id}:${image.urlIdentity || image.url || ''}:${image.thumbUrlIdentity || image.thumbUrl || ''}:${image.updatedAt || ''}`;
  }, [image.id, image.urlIdentity, image.url, image.thumbUrlIdentity, image.thumbUrl, image.updatedAt]);

  const prevImageIdentifierRef = useRef<string>(imageIdentifier);

  const clearRetryTimers = useCallback(() => {
    if (retryDelayTimerRef.current) {
      clearTimeout(retryDelayTimerRef.current);
      retryDelayTimerRef.current = null;
    }
    if (retryApplyTimerRef.current) {
      clearTimeout(retryApplyTimerRef.current);
      retryApplyTimerRef.current = null;
    }
  }, []);

  const actualDisplayUrl = useMemo(() => {
    if (imageRetryCount > 0) {
      return getDisplayUrl(image.thumbUrl || image.url, true);
    }
    return displayUrl;
  }, [displayUrl, image.thumbUrl, image.url, imageRetryCount]);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    setImageLoading(false);
    try {
      setImageLoadStatus(image, true);
    } catch {
      // cache writes are a best-effort optimization
    }
    onImageLoaded?.(image.id);
  }, [image, onImageLoaded]);

  const handleImageError = useCallback((errorEvent?: React.SyntheticEvent<Element>) => {
    const failedSrc = (errorEvent?.target as HTMLImageElement | HTMLVideoElement)?.src || displayUrl;

    setImageLoading(false);

    if (failedSrc?.includes('/placeholder.svg') || failedSrc?.includes('undefined') || !failedSrc) {
      clearRetryTimers();
      setScheduledRetryAttempt(null);
      setImageLoadError(true);
      return;
    }

    if (imageRetryCount < MAX_RETRIES) {
      setImageLoadError(false);
      setScheduledRetryAttempt(imageRetryCount + 1);
      return;
    }

    clearRetryTimers();
    setScheduledRetryAttempt(null);
    setImageLoadError(true);
  }, [clearRetryTimers, displayUrl, imageRetryCount]);

  const retryImageLoad = useCallback(() => {
    clearRetryTimers();
    setImageLoadError(false);
    setImageRetryCount(0);
    setScheduledRetryAttempt(null);
    setActualSrc(null);
    setImageLoaded(false);
    setImageLoading(false);
  }, [clearRetryTimers]);

  useEffect(() => {
    if (prevImageIdentifierRef.current === imageIdentifier) {
      return;
    }

    clearRetryTimers();
    prevImageIdentifierRef.current = imageIdentifier;

    setImageLoadError(false);
    setImageRetryCount(0);
    setScheduledRetryAttempt(null);
    const isNewImageCached = hasLoadedImage(image);
    setImageLoaded(isNewImageCached);
    if (!isNewImageCached) {
      setImageLoading(false);
    }
    setActualSrc(null);
  }, [clearRetryTimers, imageIdentifier, image]);

  useEffect(() => {
    if (scheduledRetryAttempt === null) {
      return;
    }

    clearRetryTimers();

    retryDelayTimerRef.current = setTimeout(() => {
      setImageRetryCount(scheduledRetryAttempt);
      setActualSrc(null);

      retryApplyTimerRef.current = setTimeout(() => {
        setActualSrc(getDisplayUrl(image.thumbUrl || image.url, true));
        setScheduledRetryAttempt(null);
      }, 100);
    }, 1000 * scheduledRetryAttempt);

    return clearRetryTimers;
  }, [clearRetryTimers, image.thumbUrl, image.url, scheduledRetryAttempt]);

  useEffect(() => clearRetryTimers, [clearRetryTimers]);

  useEffect(() => {
    const isPreloaded = hasLoadedImage(image);

    if (shouldLoad && actualDisplayUrl) {
      if (actualDisplayUrl === '/placeholder.svg') {
        setImageLoadError(true);
        return;
      }

      const isActuallyDifferent = actualSrc !== actualDisplayUrl;
      const isDifferentFile = stripQueryParameters(actualSrc) !== stripQueryParameters(actualDisplayUrl);

      if (isActuallyDifferent && isDifferentFile) {
        if (!isPreloaded && !actualSrc) {
          setImageLoading(true);
        }

        setActualSrc(actualDisplayUrl);
      }
    }
  }, [actualSrc, actualDisplayUrl, shouldLoad, image]);

  return {
    actualSrc,
    actualDisplayUrl,
    imageLoaded,
    imageLoading,
    imageLoadError,
    handleImageLoad,
    handleImageError,
    retryImageLoad,
    setImageLoading,
  };
}
