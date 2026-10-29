import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { UI_Z_LAYERS } from '@/shared/lib/uiLayers';
import { mediaCrossOrigin } from '@/shared/lib/media/mediaCrossOrigin';
import type { GeneratedImageWithMetadata } from '../../MediaGallery/types';
import { isPeekImageLoaded, markPeekImageLoaded, useHoverPeek } from './useHoverPeek';
import { connectorFor, placePeek, type PeekAnchor, type PeekPlacement } from './peekPlacement';

const DEFAULT_ASPECT_RATIO = 16 / 9;
const PEEK_GAP = 14;
const PEEK_CORNER_RADIUS = 8;

interface HoverPeekButtonProps {
  image: GeneratedImageWithMetadata;
  /** Thumbnail shown at once in the peek, and the video poster. */
  thumbSrc: string | null;
  /** Full-size image URL. Null for video, which plays `videoSrc` instead. */
  fullSrc: string | null;
  videoSrc: string | null;
  isVideo: boolean;
  /** Aspect ratio from the item's metadata resolution, if it has one. */
  metadataAspectRatio: number | null;
  /** Aspect ratio of the project, used until the media's own size is known. */
  projectAspectRatio: number | null;
  onOpenLightbox: (image: GeneratedImageWithMetadata) => void;
  /** Called whenever the peek opens or closes. */
  onOpenChange?: (open: boolean) => void;
}

/**
 * Desktop-only eye on a gallery tile. Hovering it opens the item's full-size media in a large
 * peek over the page; the peek stays open while the pointer is on it, and clicking it opens the
 * lightbox. Hidden on coarse pointers, where touch uses the "+" instead.
 */
export const HoverPeekButton: React.FC<HoverPeekButtonProps> = ({
  image,
  thumbSrc,
  fullSrc,
  videoSrc,
  isVideo,
  metadataAspectRatio,
  projectAspectRatio,
  onOpenLightbox,
  onOpenChange,
}) => {
  const { open, close, eyeHandlers, peekHandlers } = useHoverPeek(isVideo ? null : fullSrc);
  const eyeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const openLightbox = () => {
    close();
    onOpenLightbox(image);
  };

  return (
    <>
      <button
        ref={eyeRef}
        type="button"
        aria-label="Preview"
        onPointerEnter={eyeHandlers.onPointerEnter}
        onPointerLeave={eyeHandlers.onPointerLeave}
        onClick={(event) => {
          event.stopPropagation();
          openLightbox();
        }}
        className={cn(
          'h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-opacity',
          'data-[state=open]:bg-black/40 data-[state=open]:hover:bg-black/40 data-[state=open]:text-white data-[state=open]:ring-1 data-[state=open]:ring-white/25',
          'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100',
          '[@media(pointer:coarse)]:hidden',
        )}
        data-state={open ? 'open' : undefined}
        data-testid="gallery-tile-preview"
      >
        <Eye className="h-3.5 w-3.5" />
      </button>
      {open && createPortal(
        <HoverPeekLayer
          image={image}
          thumbSrc={thumbSrc}
          fullSrc={fullSrc}
          videoSrc={videoSrc}
          isVideo={isVideo}
          metadataAspectRatio={metadataAspectRatio}
          projectAspectRatio={projectAspectRatio}
          eyeRef={eyeRef}
          handlers={peekHandlers}
          onActivate={openLightbox}
        />,
        document.body,
      )}
    </>
  );
};

interface HoverPeekLayerProps extends Omit<HoverPeekButtonProps, 'onOpenLightbox'> {
  eyeRef: React.RefObject<HTMLButtonElement>;
  handlers: { onPointerEnter: () => void; onPointerLeave: () => void };
  onActivate: () => void;
}

const HoverPeekLayer: React.FC<HoverPeekLayerProps> = ({
  image,
  thumbSrc,
  fullSrc,
  videoSrc,
  isVideo,
  metadataAspectRatio,
  projectAspectRatio,
  eyeRef,
  handlers,
  onActivate,
}) => {
  const [fullLoaded, setFullLoaded] = useState(() => Boolean(fullSrc && isPeekImageLoaded(fullSrc)));
  const [measuredAspectRatio, setMeasuredAspectRatio] = useState<number | null>(null);
  const [entered, setEntered] = useState(false);

  // Mounted with the start styles, then flipped on the next frame so the fade and scale run.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const validAspectRatio = (value: number | null): value is number =>
    value !== null && Number.isFinite(value) && value > 0;
  const aspectRatio = [metadataAspectRatio, measuredAspectRatio, projectAspectRatio]
    .find(validAspectRatio) ?? DEFAULT_ASPECT_RATIO;
  const getAnchor = useCallback((): PeekAnchor => {
    const rect = eyeRef.current?.getBoundingClientRect();
    return rect
      ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
      : { left: 0, top: 0, right: 0, bottom: 0 };
  }, [eyeRef]);
  const calculatePlacement = useCallback(
    () => placePeek(
      getAnchor(),
      { width: window.innerWidth, height: window.innerHeight },
      aspectRatio,
      { gap: PEEK_GAP, cornerRadius: PEEK_CORNER_RADIUS },
    ),
    [getAnchor, aspectRatio],
  );
  const [placement, setPlacement] = useState<PeekPlacement>(calculatePlacement);
  const anchor = getAnchor();
  const connector = connectorFor(anchor, placement, PEEK_CORNER_RADIUS);

  useLayoutEffect(() => {
    const updatePlacement = () => setPlacement(calculatePlacement());
    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    return () => window.removeEventListener('resize', updatePlacement);
  }, [calculatePlacement]);

  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  const measure = (width: number, height: number) => {
    if (width > 0 && height > 0) setMeasuredAspectRatio(width / height);
  };
  const bridgeStyle: React.CSSProperties = placement.side === 'top'
    ? {
      left: anchor.left,
      top: placement.top + placement.height,
      width: anchor.right - anchor.left,
      height: Math.max(0, anchor.top - placement.top - placement.height),
    }
    : placement.side === 'bottom'
      ? {
        left: anchor.left,
        top: anchor.bottom,
        width: anchor.right - anchor.left,
        height: Math.max(0, placement.top - anchor.bottom),
      }
      : placement.side === 'left'
        ? {
          left: placement.left + placement.width,
          top: anchor.top,
          width: Math.max(0, anchor.left - placement.left - placement.width),
          height: anchor.bottom - anchor.top,
        }
        : {
          left: anchor.right,
          top: anchor.top,
          width: Math.max(0, placement.left - anchor.right),
          height: anchor.bottom - anchor.top,
        };
  const transformOrigins = {
    top: 'bottom center',
    right: 'left center',
    bottom: 'top center',
    left: 'right center',
  } as const;

  return (
    <div
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: UI_Z_LAYERS.GALLERY_PEEK }}
    >
      <div
        aria-hidden="true"
        data-testid="gallery-tile-peek-bridge"
        onPointerEnter={handlers.onPointerEnter}
        onPointerLeave={handlers.onPointerLeave}
        className="pointer-events-auto absolute"
        style={bridgeStyle}
      >
        {connector && (
          <div
            aria-hidden="true"
            data-testid="gallery-tile-peek-connector"
            className={cn(
              'absolute bg-white/35 transition-transform duration-[120ms] ease-out motion-reduce:transition-[opacity] motion-reduce:transform-none',
              connector.orientation === 'vertical'
                ? entered ? 'scale-y-100 motion-reduce:opacity-100' : 'scale-y-0 motion-reduce:opacity-0'
                : entered ? 'scale-x-100 motion-reduce:opacity-100' : 'scale-x-0 motion-reduce:opacity-0',
            )}
            style={connector.orientation === 'vertical'
              ? {
                left: connector.crossOffset - 1,
                top: 0,
                width: 2,
                height: connector.length,
                transformOrigin: connector.transformOrigin,
              }
              : {
                left: 0,
                top: connector.crossOffset - 1,
                width: connector.length,
                height: 2,
                transformOrigin: connector.transformOrigin,
              }}
          />
        )}
      </div>
      <div
        role="button"
        tabIndex={-1}
        aria-label="Open in lightbox"
        data-testid="gallery-tile-peek"
        draggable={false}
        onPointerEnter={handlers.onPointerEnter}
        onPointerLeave={handlers.onPointerLeave}
        onPointerDown={stop}
        onPointerUp={stop}
        onDoubleClick={stop}
        onClick={(event) => {
          event.stopPropagation();
          onActivate();
        }}
        style={{
          left: placement.left,
          top: placement.top,
          width: placement.width,
          height: placement.height,
          transformOrigin: transformOrigins[placement.side],
        }}
        className={cn(
          'pointer-events-auto absolute cursor-pointer overflow-hidden rounded-lg bg-black shadow-2xl ring-1 ring-white/25',
          'transition-[opacity,transform] duration-[120ms] ease-out motion-reduce:transition-[opacity] motion-reduce:transform-none',
          entered ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.97]',
        )}
      >
        {isVideo ? (
          <video
            src={videoSrc ?? undefined}
            poster={thumbSrc ?? undefined}
            muted
            loop
            autoPlay
            playsInline
            draggable={false}
            onLoadedMetadata={(event) => measure(event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <>
            {thumbSrc && (
              <img
                src={thumbSrc}
                alt=""
                draggable={false}
                crossOrigin={mediaCrossOrigin(thumbSrc)}
                onLoad={(event) => measure(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
                className="absolute inset-0 h-full w-full object-contain"
              />
            )}
            {fullSrc && (
              <img
                src={fullSrc}
                alt={image.prompt ?? ''}
                draggable={false}
                crossOrigin={mediaCrossOrigin(fullSrc)}
                onLoad={() => {
                  markPeekImageLoaded(fullSrc);
                  setFullLoaded(true);
                }}
                className={cn(
                  'absolute inset-0 h-full w-full object-contain transition-opacity duration-150',
                  fullLoaded ? 'opacity-100' : 'opacity-0',
                )}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};
