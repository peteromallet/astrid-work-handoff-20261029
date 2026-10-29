# Image Loading System

**Source of truth**: `src/shared/lib/media/imageLoadingPriority.ts` (strategy and batch config)

Progressive image loading with device-adaptive batching. Images cascade top-to-bottom on purpose (time-based, not scroll-dependent) to give immediate feedback, prevent browser overload, and create a predictable reveal pattern.

## Core Files

| File | Purpose |
|------|---------|
| `src/shared/components/ProgressiveLoadingManager.tsx` | Orchestrates progressive revealing via `showImageIndices` |
| `src/shared/hooks/ui-image/useProgressiveImageLoading.ts` | Session management, timing, race-condition protection |
| `src/shared/lib/media/imageLoadingPriority.ts` | Strategy calculation, device detection, batch config |
| `src/shared/hooks/gallery/useAdjacentPagePreloader.ts` | Preloads adjacent gallery pages (scheduling via `src/shared/lib/gallery/adjacentPagePreloadCoordinator.ts`) |
| `src/shared/lib/preloading/index.ts` | Shared preloading service and `hasLoadedImage` |
| `src/shared/lib/sessionId.ts` | Session IDs for overlapping load sequences |

## Data Flow

```
MediaGallery
├── ProgressiveLoadingManager (current page)
│   └── useProgressiveImageLoading
│       ├── Gets timing from imageLoadingPriority
│       └── Provides showImageIndices to children
└── useAdjacentPagePreloader (adjacent pages)
    └── adjacentPagePreloadCoordinator
        └── Prefetches neighbouring pages' generations
```

## Device-Adaptive Batching

| Device Type | Initial Batch | Stagger Delay | Max Delay |
|-------------|---------------|---------------|-----------|
| Very Low-End Mobile | 2 images | 60ms | 150ms |
| Low-End / Mobile | 3 images | 40-50ms | 120ms |
| Desktop / High-End | 4 images | 25ms | 100ms |

Device capability is detected from memory, CPU cores, and connection type (`getDeviceCapabilities` in `imageLoadingPriority.ts`).

## Loading Priority Order

| Priority | Delay | Condition |
|----------|-------|-----------|
| Preloaded images | 0ms | Caller passes `isPreloaded: true` |
| First image | 0ms | Index 0 |
| Initial batch | `index × 8`ms | Index below the batch size (0, 8, 16, 24 on desktop) |
| Remaining images | `min(stagger × (n + 1), max)` | `n` is the position after the batch |

## Performance Auto-Adjustment

None. The delays come from the device table only; no load-time feedback loop exists.

## Navigation Scenarios

Adjacent pages are prefetched as query data by `useAdjacentPagePreloader`. The first page of a visit cascades through the batch table above.

## API

```typescript
const strategy = getImageLoadingStrategy(index, {
  isMobile,
  totalImages: images.length,
  isPreloaded, // true when the caller already holds the image
});
// Returns: { shouldLoadInInitialBatch, progressiveDelay, batchGroup }
```

Individual items should NOT invent their own delays -- progressive loading is the single mechanism.

## Memory Management

- `useProgressiveImageLoading` gives each load sequence its own session ID and `AbortController`, and cancels timeouts and animation frames when a session is superseded or the component unmounts.

## Debugging

| Tag | What it shows |
|-----|---------------|
| `[GalleryDebug]` | Gallery state changes (`useMediaGalleryDebugTools.ts`) |

## Cross-Origin Media (hosted build)

**Purpose**: Which `<img>`, `<video>` and canvas sources get `crossOrigin` on the hosted build, where media comes from the local gateway on another origin.

**Source of Truth**: `src/shared/lib/media/mediaCrossOrigin.ts` (the rule), `src/integrations/runtime/connection.ts` (`isGatewayUrl`, the configured origin).

| Input | `mediaCrossOrigin(url)` | Why |
|-------|-------------------------|-----|
| Gateway URL on the hosted build | `'anonymous'` | The gateway authorizes media by `Origin`, which an element sends only in CORS mode |
| Same-origin path, CDN | `undefined` | Unchanged; no attribute rendered |
| `data:`, `blob:`, null or relative | `undefined` | Not a gateway read |

Apply it to each element whose source comes from `objectContentUrl`, `bridgeMediaUrl` or `getDisplayUrl`: `crossOrigin={mediaCrossOrigin(src)}`. A video's poster gets the same treatment (`src/shared/components/media/StyledVideoPlayer.tsx`). Scripted loads (`new Image()`, `document.createElement('video')`, the preload queue and cache probes) set `crossOrigin` before `src`, so their request has the same CORS mode as the element that shows the URL; a File or `blob:` source needs nothing.

Key invariants:

1. A plain `<img>` with a gateway source fails in Chromium: no Referer is sent from https to `http://127.0.0.1`, and the gateway refuses media without `Origin`. Every gateway element needs the attribute.
2. Canvas draws of gateway media need CORS mode too, or the canvas is tainted and cannot be read back.
3. The helper reads the configured origin at call time, so same-origin builds always get `undefined`.
4. Only `Origin` authorizes media; the gateway never accepts a Referer in its place.
5. Open: `<source>`, `<link rel=preload>` and CSS `url()` are not covered by this helper. They are settled by card A3.R (convert each, or list it with a reason).
