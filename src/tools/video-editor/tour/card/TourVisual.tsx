import type { CSSProperties, ReactNode } from 'react';
import { ArrowRight, Blocks, Play, Sparkles } from 'lucide-react';
import type { EditorTourVisual } from '../tourScript';
import { EDITOR_TOUR_MEDIA } from '../tourMedia';
import { TourMedia } from './TourMedia';
import { cn } from '@/shared/components/ui/contracts/cn.ts';

const delay = (ms: number) => ({ '--tour-delay': `${ms}ms` }) as CSSProperties;
/** Where the frame → still wipe comes to rest: the frame on the left, its realistic still on the right. */
const WIPE_REST = '50%';

/** One small picture per act, played once as the card arrives and then left at rest. */
export function TourVisual({ visual, labels, playing }: { visual: EditorTourVisual; labels: readonly [string, string]; playing: boolean }) {
  return (
    <div className="relative h-32 overflow-hidden rounded-lg bg-muted ring-1 ring-border/70" aria-hidden="true">
      {visual === 'extension' && <ExtensionToClip labels={labels} />}
      {visual === 'frame-to-still' && <FrameToStill labels={labels} />}
      {visual === 'still-to-video' && <StillToVideo labels={labels} playing={playing} />}
    </div>
  );
}

/** An extension tile sends its scene along to a clip on the timeline. */
function ExtensionToClip({ labels: [name, kind] }: { labels: readonly [string, string] }) {
  return (
    <div className="flex h-full items-center px-5">
      <div className="editor-tour-rise flex h-[84px] w-[84px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-card text-card-foreground shadow-sm ring-1 ring-border" style={delay(200)}>
        <Blocks className="mb-0.5 h-5 w-5 text-primary" strokeWidth={1.75} />
        <span className="text-[11px] leading-none">{name}</span>
        <span className="text-[10px] leading-none text-muted-foreground">{kind}</span>
      </div>
      <div className="relative mx-3 flex h-px flex-1 items-center bg-muted-foreground/30">
        <span className="editor-tour-travel absolute left-full top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0" style={delay(480)} />
        <ArrowRight className="absolute -right-1 h-3 w-3 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <div className="w-[148px] shrink-0">
        <div className="editor-tour-reveal relative aspect-video overflow-hidden rounded-md shadow-sm ring-1 ring-border" style={delay(860)}>
          <TourMedia slot={EDITOR_TOUR_MEDIA.frames[0]} kind="frame" />
        </div>
        <div className="editor-tour-grow mt-1.5 h-1.5 origin-left rounded-full bg-primary/70" style={delay(860)} />
      </div>
    </div>
  );
}

/** The realistic start frame wipes in over the Three.js one and stops halfway, so both stay in view. */
function FrameToStill({ labels: [source, model] }: { labels: readonly [string, string] }) {
  return (
    <>
      <TourMedia slot={EDITOR_TOUR_MEDIA.frames[0]} kind="frame" />
      <div className="editor-tour-wipe absolute inset-0" style={{ ...delay(300), clipPath: `inset(0 0 0 ${WIPE_REST})` }}>
        <TourMedia slot={EDITOR_TOUR_MEDIA.stills[0]} kind="still" />
      </div>
      <div className="editor-tour-wipe-handle absolute inset-y-0 w-px -translate-x-1/2 bg-card/90" style={{ ...delay(300), left: WIPE_REST }}>
        <span className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-card text-primary shadow-sm">
          <Sparkles className="h-3 w-3" strokeWidth={2} />
        </span>
      </div>
      <Chip className="left-2">{source}</Chip>
      <Chip className="right-2">{model}</Chip>
    </>
  );
}

/** The start frame comes alive: the 14 s shot fades up over it and plays under a slow playhead. */
function StillToVideo({ labels: [model, length], playing }: { labels: readonly [string, string]; playing: boolean }) {
  return (
    <>
      <TourMedia slot={EDITOR_TOUR_MEDIA.stills[0]} kind="still" />
      <div className="editor-tour-fade absolute inset-0" style={delay(450)}>
        <TourMedia slot={EDITOR_TOUR_MEDIA.video} kind="video" poster={EDITOR_TOUR_MEDIA.stills[0].url} playing={playing} />
      </div>
      <Chip className="left-2 bottom-3 flex items-center gap-1">
        <Play className="h-2.5 w-2.5 fill-current" strokeWidth={0} />
        {model}
      </Chip>
      <Chip className="right-2 bottom-3 tabular-nums">{length}</Chip>
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-background/40">
        {playing && <div className="editor-tour-playhead h-full bg-primary" />}
      </div>
    </>
  );
}

function Chip({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={cn('absolute bottom-2 rounded px-1.5 py-0.5 text-[10px] leading-none text-foreground backdrop-blur-sm bg-background/80', className)}>
      {children}
    </span>
  );
}
