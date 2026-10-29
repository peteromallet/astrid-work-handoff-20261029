import {useLayoutEffect, useRef, useState, type ComponentProps, type FC, type ReactNode} from 'react';
import {Internals, useRemotionEnvironment} from 'remotion';
import {type MediaErrorAction} from '@remotion/media';
import {ManagedVideo as Video} from '@astrid/packs/rendering/shared/managed-media';
import {MediaErrorBoundary} from './MediaErrorBoundary.tsx';

type VideoProps = ComponentProps<typeof Video> & {
  clipId: string;
  resetKey?: string;
  fallback?: ReactNode;
};

// Keep @remotion/media's decoder readiness and supported native fallback.
// Only preview substitutes a recoverable failure; renderer failures stay strict.
export const ReadinessVideo: FC<VideoProps> = ({clipId, resetKey, ...props}) => {
  const environment = useRemotionEnvironment();
  if (environment.isRendering || environment.isClientSideRendering) return <Video {...props} />;
  return <PreviewVideo key={`${clipId}:${resetKey ?? ''}:${props.src}:${props.trimBefore}:${props.trimAfter}:${props.playbackRate}`} clipId={clipId} {...props} />;
};

const PreviewVideo: FC<VideoProps> = ({clipId, fallback, onError: consumerOnError, onVideoFrame, fallbackOffthreadVideoProps, ...props}) => {
  const [failed, setFailed] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  // The player's frame (absolute, whatever Sequence this clip sits in) at the moment the decoder last drew a frame. The decoder
  // seeks once per frame change, in order, and a seek superseded by a newer one draws nothing, so the draw that arrives while
  // frame N is current is N's picture. Preview-only evidence: a test (or a person) can wait for the frame it asked for.
  const timelineFrame = Internals.useTimelinePosition();
  const timelineFrameRef = useRef(timelineFrame);
  useLayoutEffect(() => { timelineFrameRef.current = timelineFrame; });
  const [presentedFrame, setPresentedFrame] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const defaultFailure = <div role="alert" data-testid="preview-media-error" data-media-state="error" data-media-src={props.src} data-clip-id={clipId}
    style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
      zIndex: 30, pointerEvents: 'auto',
      justifyContent: 'center', background: '#321719', color: '#ffe4e6', fontFamily: 'sans-serif', gap: 12}}>
    <span>Video failed to load</span>
    <button type="button" onClick={() => {setFailed(false); setAttempt(value => value + 1);}}>Retry video</button>
  </div>;
  const failure = fallback ?? defaultFailure;
  // Returning undefined keeps Remotion's default error action, as before.
  const handleFailure = (error: unknown): MediaErrorAction | undefined => {
    setFrameReady(false);
    setPresentedFrame(null);
    setFailed(true);
    consumerOnError?.(error as never);
    return undefined;
  };
  if (failed) return failure;
  return <MediaErrorBoundary key={attempt} clipId={clipId} resetKey={String(attempt)} fallback={failure} onError={handleFailure}>
    <span hidden data-preview-decoded-frame={frameReady} data-preview-media-src={props.src} data-preview-presented-frame={presentedFrame ?? undefined} />
    <Video {...props} onVideoFrame={(frame) => {
      setFrameReady(true);
      setPresentedFrame(timelineFrameRef.current);
      onVideoFrame?.(frame);
    }} onError={consumerOnError ? handleFailure : undefined} fallbackOffthreadVideoProps={{...fallbackOffthreadVideoProps, onError: (error) => {
      // Decoder capability failures may still use the native video fallback.
      // Its terminal media error removes the subtree and releases its blockers.
      handleFailure(error);
      fallbackOffthreadVideoProps?.onError?.(error);
    }}} />
  </MediaErrorBoundary>;
};
