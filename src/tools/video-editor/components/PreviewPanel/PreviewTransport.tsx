import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { Gauge, Maximize, Minimize, Pause, Play, SkipBack, Volume1, Volume2, VolumeX } from 'lucide-react';
import { Slider as SliderPrimitive } from '@base-ui/react/slider';
import type { PlayerRef } from '@remotion/player';
import { cn } from '@/shared/components/ui/contracts/cn.ts';
import { VIDEO_EDITOR_THEME_VARS } from '@/tools/video-editor/lib/themeTokens.ts';
import { CENTISECOND_TIME_OPTIONS, formatTime } from '@/shared/lib/timeFormatting';
import {
  PREVIEW_PLAYBACK_RATES,
  setPreviewPlaybackPreferences,
  togglePreviewMuted,
  usePreviewPlaybackPreferences,
} from './previewPlaybackPreferences.ts';

/**
 * The preview's controls sit on the picture, so they stay out of its way: play is the one
 * control with a body (a soft glass disc), and everything else is a bare glyph that lights up
 * under the pointer. Light on dark in either theme, since they always sit over the film.
 */
const FOCUS_RING_CLASS = 'outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--video-editor-stage-handle-border)]';
const GLYPH_BUTTON_CLASS = cn(
  'pointer-events-auto relative inline-flex shrink-0 items-center justify-center rounded-full text-[color:var(--video-editor-stage-fg)] transition-colors duration-150',
  'hover:bg-[var(--video-editor-stage-glyph-hover)]',
  'disabled:pointer-events-none disabled:opacity-40 [&_svg]:drop-shadow-[0_1px_1px_rgb(0_0_0/0.45)]',
  FOCUS_RING_CLASS,
);
const PLAY_BUTTON_CLASS = cn(
  'pointer-events-auto inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--video-editor-stage-dim)] text-[color:var(--video-editor-stage-fg)] backdrop-blur-md transition-colors duration-150',
  'hover:bg-[var(--video-editor-stage-control-bg-strong)] disabled:pointer-events-none disabled:opacity-40',
  FOCUS_RING_CLASS,
);
const STAGE_TEXT_CLASS = 'font-mono text-xs tabular-nums text-[color:var(--video-editor-stage-fg-muted)] [text-shadow:0_1px_1px_rgb(0_0_0/0.45)]';

/** Hit areas and glyphs: compact for the editor's mouse, larger for full screen and fingers. */
const SIZES = {
  editor: { glyph: 'h-8 w-8 [&_svg]:h-[18px] [&_svg]:w-[18px]', speed: 'h-8 min-w-8', spacer: 'w-8', play: 'h-10 w-10', icon: 'h-[18px] w-[18px]', playIcon: 'h-5 w-5', gap: 'gap-1' },
  fullscreen: { glyph: 'h-11 w-11 [&_svg]:h-[22px] [&_svg]:w-[22px]', speed: 'h-11 min-w-11', spacer: 'w-11', play: 'h-[52px] w-[52px]', icon: 'h-[22px] w-[22px]', playIcon: 'h-6 w-6', gap: 'gap-2' },
  touch: { glyph: 'h-11 w-11 [&_svg]:h-5 [&_svg]:w-5', speed: 'h-11 min-w-11', spacer: 'w-11', play: 'h-12 w-12', icon: 'h-5 w-5', playIcon: 'h-[22px] w-[22px]', gap: 'gap-2' },
} as const;
type TransportSize = (typeof SIZES)[keyof typeof SIZES];

/** A mouse press must not leave focus on the button, so Space keeps meaning play. */
const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault();

export interface PreviewTransportProps {
  playerRef: RefObject<PlayerRef>;
  fps: number;
  durationInFrames: number;
  isPlaying: boolean;
  canPlay: boolean;
  /** The narrow bar (condensed editor, phone): jump, play and full screen. Volume and speed
   *  wait in full screen, which has the room. */
  compact: boolean;
  /** Phone/tablet: touch-sized buttons, and mute in place of a volume slider (iOS fixes media volume). */
  touchChrome: boolean;
  /** Volume, speed and full screen beside the transport. A staged shell that sizes the
   *  transport itself (the public homepage) keeps to jump and play. */
  playerControls: boolean;
  /** The editor with a mouse: the bar rests while the pointer is elsewhere (play alone when
   *  paused, nothing while playing) and comes up when the pointer is over the preview. It needs a
   *  `group/preview` ancestor; touch and hosted outlets keep the bar in view instead. */
  revealOnHover: boolean;
  fullscreen: boolean;
  /** Fullscreen while playing and idle: the bar fades away. */
  idle: boolean;
  onTogglePlay: () => void;
  onJumpToStart: () => void;
  onSeekFrame: (frame: number) => void;
  onToggleFullscreen: () => void;
}

export function PreviewTransport({
  playerRef,
  fps,
  durationInFrames,
  isPlaying,
  canPlay,
  compact,
  touchChrome,
  playerControls,
  revealOnHover,
  fullscreen,
  idle,
  onTogglePlay,
  onJumpToStart,
  onSeekFrame,
  onToggleFullscreen,
}: PreviewTransportProps) {
  const { rate } = usePreviewPlaybackPreferences();
  const size: TransportSize = touchChrome ? SIZES.touch : fullscreen ? SIZES.fullscreen : SIZES.editor;
  const hover = revealOnHover && !fullscreen;
  // Shown with the pointer over the preview, or while a control has keyboard focus.
  const onReveal = hover
    ? 'opacity-0 transition-[opacity,background-color] duration-200 group-hover/preview:opacity-100 group-has-[:focus-visible]/transport:opacity-100 motion-reduce:transition-none'
    : undefined;
  // Volume and speed: the narrow bar keeps to the transport and full screen, and leaves them to
  // full screen, which has the room.
  const watchControls = playerControls && (fullscreen || !compact);

  return (
    <div
      className={cn(
        'astrid-preview-transport group/transport pointer-events-none absolute inset-x-0 bottom-0 z-10 transition-[opacity,visibility] duration-300',
        fullscreen ? 'px-4 pb-4 pt-24' : 'px-2 pb-2 pt-10',
        idle && 'invisible opacity-0',
      )}
      style={{
        // The bar carries its own stage colours: a host can portal it outside the player.
        ...VIDEO_EDITOR_THEME_VARS,
        ...(fullscreen ? {
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        } : null),
      }}
      data-preview-transport
    >
      {/* A soft shade so the glyphs read over a bright picture; it comes and goes with the bar. */}
      <div
        aria-hidden
        className={cn('astrid-preview-transport-scrim pointer-events-none absolute inset-0', onReveal)}
        style={{
          backgroundImage: fullscreen
            // Deeper in full screen, where the time and scrubber sit over the picture too.
            ? 'linear-gradient(to top, var(--video-editor-stage-control-bg-strong), var(--video-editor-stage-control-bg) 45%, transparent)'
            : 'linear-gradient(to top, var(--video-editor-stage-gradient-start), transparent)',
        }}
      />
      {fullscreen && (
        <PreviewScrubber playerRef={playerRef} fps={fps} durationInFrames={durationInFrames} touch={touchChrome} onSeekFrame={onSeekFrame} />
      )}
      {/* Play sits in the middle; the sides keep their width and the middle gives way. */}
      <div className="relative grid grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] items-center gap-2">
        <div className={cn('flex min-w-0 items-center justify-self-start', onReveal)}>
          {watchControls && <PreviewVolumeControl size={size} slider={!touchChrome} />}
        </div>
        <div className={cn('flex items-center', size.gap)}>
          <GlyphButton size={size} className={onReveal} onClick={onJumpToStart} label="Jump to beginning">
            <SkipBack />
          </GlyphButton>
          <button
            type="button"
            className={cn(PLAY_BUTTON_CLASS, size.play, hover && isPlaying && onReveal)}
            disabled={!canPlay}
            onMouseDown={keepFocus}
            onClick={onTogglePlay}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying
              ? <Pause className={cn(size.playIcon, 'fill-current')} strokeWidth={1.5} />
              // The triangle's weight sits left of its box; nudge it to look centred in the disc.
              : <Play className={cn(size.playIcon, 'translate-x-px fill-current')} strokeWidth={1.5} />}
          </button>
          {/* Balances jump, so play stays at the centre of the bar. */}
          <span aria-hidden className={cn('shrink-0', size.spacer)} />
        </div>
        <div className={cn('flex min-w-0 items-center justify-self-end', size.gap, onReveal)}>
          {watchControls && <PreviewSpeedSelect rate={rate} size={size} />}
          {playerControls && (
            <GlyphButton
              size={size}
              onClick={onToggleFullscreen}
              title={fullscreen ? 'Exit full screen (Esc)' : 'Full screen (F)'}
              label={fullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {fullscreen ? <Minimize /> : <Maximize />}
            </GlyphButton>
          )}
        </div>
      </div>
    </div>
  );
}

function GlyphButton({
  size,
  label,
  title,
  onClick,
  className,
  pressed,
  children,
}: {
  size: TransportSize;
  label: string;
  title?: string;
  onClick: () => void;
  className?: string;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(GLYPH_BUTTON_CLASS, size.glyph, className)}
      onMouseDown={keepFocus}
      onClick={onClick}
      aria-pressed={pressed}
      title={title ?? label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function StageSlider({
  value,
  max,
  step,
  label,
  valueText,
  onChange,
  className,
  thumbClassName,
}: {
  value: number;
  max: number;
  step: number;
  label: string;
  valueText: string;
  onChange: (value: number) => void;
  className?: string;
  thumbClassName?: string;
}) {
  return (
    <SliderPrimitive.Root
      value={value}
      min={0}
      max={max}
      step={step}
      thumbAlignment="edge"
      onValueChange={(next) => onChange(Array.isArray(next) ? (next[0] ?? 0) : (next as number))}
      className={cn('group/stage-slider pointer-events-auto relative flex touch-none select-none items-center', className)}
    >
      <SliderPrimitive.Control className="flex h-full w-full cursor-pointer items-center">
        <SliderPrimitive.Track className="relative h-[3px] w-full rounded-full bg-[var(--video-editor-stage-ghost-border)] shadow-[0_1px_1px_rgb(0_0_0/0.25)] transition-[height] duration-150 group-hover/stage-slider:h-[5px] group-data-[dragging]/stage-slider:h-[5px]">
          <SliderPrimitive.Indicator className="absolute h-full rounded-full bg-[var(--video-editor-stage-fg)]" />
          <SliderPrimitive.Thumb
            getAriaLabel={() => label}
            getAriaValueText={() => valueText}
            className={cn(
              'h-3 w-3 rounded-full bg-[var(--video-editor-stage-fg)] shadow-[0_1px_3px_rgb(0_0_0/0.35)] outline-none transition-opacity duration-150 focus-visible:ring-2 focus-visible:ring-[color:var(--video-editor-stage-handle-border)]',
              thumbClassName,
            )}
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

function PreviewVolumeControl({ size, slider }: { size: TransportSize; slider: boolean }) {
  const { volume, muted } = usePreviewPlaybackPreferences();
  const level = muted ? 0 : volume;
  const Icon = level === 0 ? VolumeX : level < 0.5 ? Volume1 : Volume2;
  const percent = Math.round(level * 100);
  return (
    // Hovering or focusing the group opens the level, as video players do; touch keeps to mute.
    <div className="group/volume pointer-events-auto flex min-w-0 items-center">
      <GlyphButton size={size} onClick={togglePreviewMuted} pressed={level === 0} title={level === 0 ? 'Unmute' : 'Mute'} label="Mute preview">
        <Icon />
      </GlyphButton>
      {slider && (
        <div className="w-0 overflow-hidden opacity-0 transition-[width,opacity] duration-200 ease-out group-hover/volume:w-[5.5rem] group-hover/volume:opacity-100 group-focus-within/volume:w-[5.5rem] group-focus-within/volume:opacity-100">
          <StageSlider
            className="ml-1 mr-2 h-6 w-[4.75rem]"
            value={level}
            max={1}
            step={0.01}
            label="Preview volume"
            valueText={`${percent}%`}
            onChange={(next) => setPreviewPlaybackPreferences({ volume: next, muted: next === 0 })}
          />
        </div>
      )}
    </div>
  );
}

function formatRate(rate: number): string {
  return `${rate}×`;
}

/** Speed is rarely touched, so it is a quiet glyph; once changed, the glyph becomes the rate, so a
 *  film playing fast or slow always says so. */
function PreviewSpeedSelect({ rate, size }: { rate: number; size: TransportSize }) {
  const changed = rate !== 1;
  return (
    // A native list: it opens over a fullscreen element and on phones, where a portal popover cannot.
    <label
      className={cn(
        GLYPH_BUTTON_CLASS,
        size.speed,
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[color:var(--video-editor-stage-handle-border)]',
        changed && 'px-2 text-[color:var(--video-editor-stage-fg)]',
      )}
      title={changed ? `Playback speed: ${formatRate(rate)}` : 'Playback speed'}
    >
      {changed
        ? <span aria-hidden className="text-xs font-medium tabular-nums [text-shadow:0_1px_1px_rgb(0_0_0/0.45)]">{formatRate(rate)}</span>
        : <Gauge aria-hidden className={size.icon} />}
      <select
        aria-label="Playback speed"
        value={String(rate)}
        onChange={(event) => setPreviewPlaybackPreferences({ rate: Number(event.target.value) })}
        className="absolute inset-0 cursor-pointer appearance-none rounded-full opacity-0"
      >
        {PREVIEW_PLAYBACK_RATES.map((option) => (
          <option key={option} value={String(option)}>{option === 1 ? 'Normal' : formatRate(option)}</option>
        ))}
      </select>
    </label>
  );
}

/** Fullscreen hides the timeline, so the picture carries its own position and scrubber. */
function PreviewScrubber({
  playerRef,
  fps,
  durationInFrames,
  touch,
  onSeekFrame,
}: {
  playerRef: RefObject<PlayerRef>;
  fps: number;
  durationInFrames: number;
  /** Touch has no hover, so the handle stays in view. */
  touch: boolean;
  onSeekFrame: (frame: number) => void;
}) {
  const [frame, setFrame] = useState(() => playerRef.current?.getCurrentFrame() ?? 0);
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return undefined;
    const onFrame = (event: { detail: { frame: number } }) => setFrame(event.detail.frame);
    setFrame(player.getCurrentFrame());
    player.addEventListener('frameupdate', onFrame);
    return () => player.removeEventListener('frameupdate', onFrame);
  }, [playerRef]);
  const lastFrame = Math.max(0, durationInFrames - 1);
  const shown = Math.min(frame, lastFrame);
  const time = (value: number) => formatTime(value / fps, CENTISECOND_TIME_OPTIONS);
  return (
    <div className="relative mb-1 flex items-center gap-3 px-1">
      <span className={cn(STAGE_TEXT_CLASS, 'shrink-0')}>{time(shown)}</span>
      <StageSlider
        className="h-5 min-w-0 flex-1"
        thumbClassName={touch ? undefined : 'opacity-0 group-hover/stage-slider:opacity-100 group-focus-within/stage-slider:opacity-100 group-data-[dragging]/stage-slider:opacity-100'}
        value={shown}
        max={Math.max(1, lastFrame)}
        step={1}
        label="Playback position"
        valueText={`${time(shown)} of ${time(durationInFrames)}`}
        onChange={(next) => {
          setFrame(next);
          onSeekFrame(Math.round(next));
        }}
      />
      <span className={cn(STAGE_TEXT_CLASS, 'shrink-0 text-[color:var(--video-editor-stage-fg-subtle)]')}>{time(durationInFrames)}</span>
    </div>
  );
}
