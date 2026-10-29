import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PublicAstridSkySession } from './publicAstridSkySession';
import { formatSkyPreviewHours, SKY_PREVIEW_STEP_MINUTES, type PublicAstridSkyPreviewRequest } from './publicAstridSkyPreviewParam';
import './PublicAstridSkyPreview.css';

const PLAY_DAY_MS = 30_000;

/** Owner-only time-of-day scrubber (see publicAstridSkyPreview.ts); rendered only when `?sky=` asks for it. */
export function PublicAstridSkyPreview({ session, request }: { session: PublicAstridSkySession; request: PublicAstridSkyPreviewRequest }) {
  const controls = useSyncExternalStore(session.subscribeControls, session.getControlsSnapshot, session.getControlsSnapshot);
  const [playing, setPlaying] = useState(false);
  const pinned = controls.settings.hours !== null;
  const hoursRef = useRef(controls.hours);
  hoursRef.current = controls.hours;

  useEffect(() => {
    if (request.hours !== null) session.setManualHours(request.hours);
  }, [session, request]);

  useEffect(() => {
    if (!playing) return undefined;
    let frame = 0;
    let last = performance.now();
    let at = hoursRef.current;
    const step = (time: number) => {
      at = (at + ((time - last) / PLAY_DAY_MS) * 24) % 24;
      last = time;
      session.setManualHours(at);
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [playing, session]);

  const scrub = (minutes: number) => {
    setPlaying(false);
    session.setManualHours(minutes / 60);
  };

  return (
    <div className="astrid-sky-preview" role="group" aria-label="Sky time preview" data-pinned={pinned || undefined}>
      <button
        type="button"
        className="astrid-sky-preview-button"
        aria-label={playing ? 'Pause the day' : 'Play the day'}
        aria-pressed={playing}
        onClick={() => setPlaying((value) => !value)}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <output className="astrid-sky-preview-time" aria-live="off">{formatSkyPreviewHours(controls.hours)}</output>
      <input
        className="astrid-sky-preview-slider"
        type="range"
        min={0}
        max={24 * 60 - SKY_PREVIEW_STEP_MINUTES}
        step={SKY_PREVIEW_STEP_MINUTES}
        value={Math.min(24 * 60 - SKY_PREVIEW_STEP_MINUTES, Math.round((controls.hours * 60) / SKY_PREVIEW_STEP_MINUTES) * SKY_PREVIEW_STEP_MINUTES)}
        aria-label="Time of day"
        onChange={(event) => scrub(Number(event.currentTarget.value))}
      />
      <button
        type="button"
        className="astrid-sky-preview-button astrid-sky-preview-live"
        disabled={!pinned && !playing}
        onClick={() => { setPlaying(false); session.setNow(); }}
      >
        Live
      </button>
    </div>
  );
}
