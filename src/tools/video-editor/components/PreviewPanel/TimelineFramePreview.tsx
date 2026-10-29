import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Thumbnail } from '@remotion/player';
import type { PanelFrameAnchor, PanelPreviewService } from '@/sdk/ui.ts';
import { TimelineRenderer } from '../../compositions/TimelineRenderer.tsx';
import { useOptionalVideoEditorRuntime } from '../../contexts/VideoEditorRuntimeContext.tsx';
import { projectOutputTimelineConfig } from '../../data/timelineOutputProjection.ts';
import { getClipDurationInFrames, parseResolution, secondsToFrames } from '../../lib/config-utils.ts';
import { CENTISECOND_TIME_OPTIONS, formatTime } from '@/shared/lib/timeFormatting';
import { cloneFrame, FramePreviewCache, timelineSecondsToFrame } from '../../lib/frame-preview-cache.ts';
import { areShotsSettling } from '../../lib/shots-settling.ts';
import { getAdmittedElementReadiness, getAdmittedElementSelection, subscribeAdmittedElementReadiness, subscribeAdmittedElements } from '../../runtime/admitted-elements.ts';
import type { ResolvedTimelineConfig } from '../../types/index.ts';

interface FrameRequest { seconds: number; anchor: PanelFrameAnchor }

/** Moving between words keeps the card up, so skimming a line never blinks. */
const LINGER_MS = 250;

/** A per-panel service; handles from an earlier word cannot dismiss a newer one. */
export function usePanelFramePreview() {
  const [request, setRequest] = useState<FrameRequest | null>(null);
  const linger = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelLinger = useCallback(() => {
    if (linger.current !== null) clearTimeout(linger.current);
    linger.current = null;
  }, []);
  const preview = useMemo<PanelPreviewService>(() => ({
    showFrame: (input) => {
      const next = { ...input };
      cancelLinger();
      setRequest(next);
      return {
        dispose: () => {
          cancelLinger();
          linger.current = setTimeout(() => {
            linger.current = null;
            setRequest((current) => current === next ? null : current);
          }, LINGER_MS);
        },
      };
    },
  }), [cancelLinger]);
  const dismiss = useCallback(() => { cancelLinger(); setRequest(null); }, [cancelLinger]);
  useEffect(() => {
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      cancelLinger();
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [dismiss, cancelLinger]);
  return { preview, request };
}

/** The largest frame the card shows: 256x144 at 16:9, never taller than 176. */
const FRAME_MAX_WIDTH = 256;
const FRAME_MAX_HEIGHT = 176;
/** Card chrome around the frame: a 3px popover mat inside a 1px border. */
const MAT = 4;
/** Word to card edge; the pointer fills most of it. */
const OFFSET = 9;
/** Keep the card this far inside the viewport and the panel. */
const MARGIN = 8;
/** The pointer never runs into the card's rounded corners. */
const POINTER_INSET = 14;

export function framePreviewSize(aspect: number) {
  const width = Math.round(Math.min(FRAME_MAX_WIDTH, FRAME_MAX_HEIGHT * aspect));
  return { width, height: Math.round(width / aspect) };
}

/**
 * Fixed viewport placement keeps the card out of scroll clipping and off the word:
 * centred above it (below when the top is tight), clamped to the panel's columns.
 * `width`/`height` are the card; `frameWidth`/`frameHeight` the whole-pixel film frame.
 */
export function framePreviewPlacement(anchor: PanelFrameAnchor, aspect: number, viewportWidth: number, viewportHeight: number, bounds?: { left: number; right: number }) {
  const natural = framePreviewSize(aspect);
  const above = Math.max(0, anchor.top - OFFSET - MARGIN - MAT * 2);
  const below = Math.max(0, viewportHeight - anchor.top - anchor.height - OFFSET - MARGIN - MAT * 2);
  const preferredHeight = Math.min(natural.height, Math.max(0, viewportWidth - MARGIN * 2 - MAT * 2) / aspect);
  const flip = above < preferredHeight && below > above;
  const frameHeight = Math.floor(Math.min(preferredHeight, flip ? below : above));
  const frameWidth = Math.round(frameHeight * aspect);
  const width = frameWidth + MAT * 2;
  const height = frameHeight + MAT * 2;
  const center = anchor.left + anchor.width / 2;
  // Stay inside the panel when the card fits there, else just inside the viewport.
  const panelLeft = Math.max(MARGIN, (bounds?.left ?? 0) + MARGIN);
  const panelRight = Math.min(viewportWidth - MARGIN, (bounds?.right ?? viewportWidth) - MARGIN);
  const [minLeft, maxRight] = panelRight - panelLeft >= width ? [panelLeft, panelRight] : [MARGIN, viewportWidth - MARGIN];
  const left = Math.round(Math.max(minLeft, Math.min(center - width / 2, maxRight - width)));
  return {
    width, height, frameWidth, frameHeight, left,
    top: Math.round(flip ? anchor.top + anchor.height + OFFSET : anchor.top - OFFSET - height),
    side: flip ? 'bottom' as const : 'top' as const,
    pointer: Math.round(Math.max(POINTER_INSET, Math.min(center - left, width - POINTER_INSET))),
  };
}

/** One reusable Remotion still, with bounded frozen DOM frames for return visits. */
export function TimelineFramePreview({ config, request, bounds }: { config: ResolvedTimelineConfig | null; request: FrameRequest | null; bounds?: RefObject<HTMLElement | null> }) {
  const runtime = useOptionalVideoEditorRuntime();
  const admission = useSyncExternalStore(subscribeAdmittedElements, getAdmittedElementSelection, getAdmittedElementSelection);
  const readiness = useSyncExternalStore(subscribeAdmittedElementReadiness, getAdmittedElementReadiness, getAdmittedElementReadiness);
  const output = useMemo(() => config ? projectOutputTimelineConfig(config).config : null, [config]);
  const revision = useMemo(() => ({ output, admission, readiness, host: runtime?.astridElementHost }), [output, admission, readiness, runtime?.astridElementHost]);
  const [cache] = useState(() => new FramePreviewCache<HTMLElement>());
  const [delivery, setDelivery] = useState<{ revision: object; frame: number } | null>(null);
  const [, refresh] = useState(0);
  const live = useRef<HTMLDivElement>(null);
  const frozen = useRef<HTMLDivElement>(null);
  const metadata = useMemo(() => {
    // Without a composition size there is no film frame to show (the renderer needs one too).
    const resolution: unknown = output?.output.resolution;
    if (!output || typeof resolution !== 'string') return null;
    const fps = output.output.fps;
    const { width, height } = parseResolution(resolution);
    if (!(width > 0 && height > 0)) return null;
    return {
      fps, compositionWidth: width, compositionHeight: height,
      durationInFrames: Math.max(1, ...output.clips.map((clip) => secondsToFrames(clip.at, fps) + getClipDurationInFrames(clip, fps))),
    };
  }, [output]);
  const frame = request && metadata ? timelineSecondsToFrame(request.seconds, metadata.fps, metadata.durationInFrames) : null;
  const cached = frame === null ? undefined : cache.get(revision, frame);
  const preparing = Boolean(output && runtime?.project?.projectId && runtime.astridElementHost?.isPreviewPreparing?.(runtime.project.projectId, output.clips));
  const settling = areShotsSettling(runtime?.shots);
  const inputProps = useMemo(() => ({ config: output!, ...(runtime?.astridElementHost ? { astridElementHost: runtime.astridElementHost } : {}) }), [output, runtime?.astridElementHost]);

  useEffect(() => {
    if (frame !== null && !cached) setDelivery({ revision, frame });
  }, [revision, frame, cached]);

  // Decode and paint first. Late child-shot loads, video seeks and image loads
  // restart capture; a loading placeholder is never retained as a film frame.
  useEffect(() => {
    const root = live.current;
    if (!root || !delivery || delivery.revision !== revision || preparing || settling) return;
    let raf = 0;
    let stopped = false;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => {
          if (stopped || root.querySelector('[data-testid="shot-preview-loading"], [data-frame-loading]')) return;
          const composition = root.firstElementChild;
          const snapshot = composition instanceof HTMLElement ? cloneFrame(composition) : null;
          if (snapshot) {
            cache.set(revision, delivery.frame, snapshot);
            refresh((value) => value + 1);
          }
        });
      });
    };
    const observer = new MutationObserver(schedule);
    observer.observe(root, { subtree: true, childList: true, attributes: true });
    for (const event of ['load', 'loadeddata', 'seeked']) root.addEventListener(event, schedule, true);
    schedule();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      for (const event of ['load', 'loadeddata', 'seeked']) root.removeEventListener(event, schedule, true);
    };
  }, [cache, revision, delivery, preparing, settling]);

  useEffect(() => {
    frozen.current?.replaceChildren(...(cached ? [cached] : []));
  }, [cached]);

  if (!output || !metadata || !delivery) return null;
  const aspect = metadata.compositionWidth / metadata.compositionHeight;
  const panel = bounds?.current?.getBoundingClientRect();
  const placement = framePreviewPlacement(request?.anchor ?? { left: 0, top: 0, width: 0, height: 0 }, aspect, window.innerWidth, window.innerHeight, panel && panel.width > 0 ? panel : undefined);
  const visible = frame !== null && placement.frameHeight > 0;
  // Render once at the natural size; a smaller card only ever scales down.
  const base = framePreviewSize(aspect);
  const layer = { position: 'absolute', inset: 0, width: base.width, height: base.height, transform: `scale(${placement.frameWidth / base.width})`, transformOrigin: 'top left' } as const;
  const showingLive = !cached && !preparing && !settling && delivery.revision === revision && delivery.frame === frame;
  return createPortal(
    // The tooltip enter classes restart on each fresh show; word-to-word moves keep them, so the card just follows.
    <div role={visible ? 'tooltip' : undefined} aria-label="Film frame preview" aria-hidden={!visible}
      className={`rounded-md border border-border bg-popover p-[3px] shadow-lg ${visible ? `animate-in fade-in-0 zoom-in-95 duration-100 ease-out ${placement.side === 'top' ? 'slide-in-from-bottom-1' : 'slide-in-from-top-1'}` : ''}`}
      style={{ position: 'fixed', zIndex: 100, pointerEvents: 'none', left: placement.left, top: placement.top, width: placement.width, height: placement.height,
        transformOrigin: `${placement.pointer}px ${placement.side === 'top' ? '100%' : '0'}`, visibility: visible ? 'visible' : 'hidden' }}>
      <span aria-hidden="true" className={`absolute h-2.5 w-2.5 rotate-45 border-border bg-popover ${placement.side === 'top' ? 'border-b border-r' : 'border-l border-t'}`}
        style={{ left: placement.pointer - 5, ...(placement.side === 'top' ? { bottom: -6 } : { top: -6 }) }} />
      {/* Film layers sit above a quiet pulse that shows through until the frame has painted. */}
      <div className="transcript-frame-preview relative isolate overflow-hidden rounded-[6px] bg-background" style={{ width: placement.frameWidth, height: placement.frameHeight }}>
        <div ref={frozen} style={{ ...layer, zIndex: 1, visibility: cached ? 'visible' : 'hidden' }} />
        <div ref={live} style={{ ...layer, zIndex: 1, visibility: showingLive ? 'inherit' : 'hidden' }}>
          <Thumbnail component={TimelineRenderer} inputProps={inputProps} {...metadata} frameToDisplay={Math.min(delivery.frame, metadata.durationInFrames - 1)} style={{ width: '100%', height: '100%' }}
            renderLoading={() => <div data-frame-loading="" />} />
        </div>
        {!cached && <span data-testid="frame-preview-loading" aria-hidden="true" className="absolute inset-0 animate-pulse bg-muted/50" />}
      </div>
      {frame !== null && (
        <span className="absolute bottom-[7px] left-[7px] rounded-sm bg-card/85 px-1 py-0.5 font-mono text-[10px] leading-none tracking-[0.08em] text-muted-foreground">
          {formatTime(frame / metadata.fps, CENTISECOND_TIME_OPTIONS)}
        </span>
      )}
    </div>, document.body,
  );
}
