import type { PreloadableImage, PreloadConfig } from './types';
import { PreloadQueue } from './queue';
import { setImageLoadStatus, hasLoadedImage, markImageLoaded } from './tracker';
import { getDisplayUrl } from '@/shared/lib/media/mediaUrl';
import { isPreloadableMediaUrl } from '@/shared/lib/media/mediaTypeHelpers';

function hasImageId(image: PreloadableImage): image is PreloadableImage & { id: string } {
  return typeof image.id === 'string' && image.id.length > 0;
}

export async function preloadImages(
  images: PreloadableImage[],
  queue: PreloadQueue,
  config: PreloadConfig,
  priority = 0
): Promise<void> {
  const limitedImages = images.slice(0, config.maxImagesPerPage);
  const toPreload = limitedImages.filter((img) => !hasImageId(img) || !hasLoadedImage(img));

  if (toPreload.length === 0) {
    return;
  }

  const promises = toPreload.map(async (img, idx) => {
    const url = getImageUrl(img, config.preloadThumbnailsOnly);

    if (!url) {
      return;
    }

    // Skip known non-preloadable media URLs (e.g., join-clips placeholder outputs).
    if (!isPreloadableMediaUrl(url)) {
      return;
    }

    try {
      // Slightly decrease priority for later images in the batch
      const element = await queue.add(url, priority - idx);

      if (hasImageId(img)) {
        setImageLoadStatus(img, true);
      }

      // Track by URL with element ref (for browser cache persistence)
      markImageLoaded(url, { element });
    } catch {
      // Preloading is best-effort - don't throw on failure
    }
  });

  await Promise.allSettled(promises);
}

function getImageUrl(img: PreloadableImage, thumbnailOnly: boolean): string | null {
  const rawUrl = thumbnailOnly
    ? (img.thumbUrl || img.thumbnail_url || null)
    : (img.url || null);

  if (!rawUrl) {
    return null;
  }

  return getDisplayUrl(rawUrl);
}
