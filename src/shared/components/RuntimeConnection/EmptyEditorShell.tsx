import type { CSSProperties, ReactNode } from 'react';
import {
  Activity, ChevronDown, Download, GripHorizontal, History, Lock, Maximize2, Mic, PanelsTopLeft, Play,
  Plus, PlusCircle, Redo2, Send, Settings, Sparkles, Star, Undo2, Video, Volume2, Wrench, ZoomIn, ZoomOut,
} from 'lucide-react';
import { AppSkyBackground } from '@/shared/components/TimeOfDay/TimeOfDayControl';
import { Button } from '@/shared/components/ui/button.tsx';
import { VIDEO_EDITOR_THEME_VARS } from '@/tools/video-editor/lib/themeTokens.ts';

/**
 * The editor as it opens, with nothing loaded: drawn behind the connection cards so the person is already in the app
 * and one step from it. The real editor needs Astrid to render at all (its stores, header and panes read the Runtime),
 * so this is a still copy of its desktop layout with the same classes, tokens, grid and sky. When Astrid connects, the
 * real editor mounts beneath it and the two cross-fade without anything moving. It takes no input and is hidden from
 * assistive tech. Keep it in step with `AppHeader`, `TimelineEditorShellCore`'s desktop grid, `PreviewPanel`,
 * `TimelineEditorShellToolbar`, `VideoEditorRightPanelDock` and `TasksPane`.
 */
const LOGO_SRC = '/astrid-favicon.svg';

/** TimelineEditorShellCore's desktop grid with the right dock open (its default). */
const DOCK_TRACK = 'calc(min(420px, 32vw, calc(100vw - 24px)) + 12px)';
const GRID_STYLE: CSSProperties = {
  gridTemplateRows: 'minmax(0,1fr) auto minmax(200px,36%)',
  gridTemplateColumns: `minmax(0,1fr) minmax(0, ${DOCK_TRACK})`,
  columnGap: 0,
};
const WORK_AREA_STYLE: CSSProperties = { gridColumn: '1 / span 2', marginInlineEnd: DOCK_TRACK };
/** The timeline's label column and its ruler: a label every 5 s, 160 px apart at the default zoom. */
const LABEL_WIDTH = 144;
const RULER_TICKS = ['0:00.00', '0:05.00', '0:10.00', '0:15.00', '0:20.00', '0:25.00'];
const PANE_CONTROL = 'flex items-center rounded-md border border-border/70 bg-card/90 text-muted-foreground';
/** RemotionPreview's play disc, in the stage's own tokens. */
const PLAY_DISC = 'flex items-center justify-center rounded-full bg-[var(--video-editor-stage-dim)] text-[color:var(--video-editor-stage-fg)]';

function Icon({ children }: { children: ReactNode }) {
  return <span className="flex h-6 w-6 items-center justify-center">{children}</span>;
}

function Header() {
  return (
    <header className="relative z-10 flex min-h-10 w-full min-w-0 items-center gap-2 border-b border-border bg-background px-3 py-1.5 text-sm text-muted-foreground">
      <img src={LOGO_SRC} alt="" className="h-[30px] w-[30px] shrink-0" />
      <span className={`${PANE_CONTROL} h-8 w-36 gap-1.5 px-2`}>
        <span className="h-2.5 w-20 rounded-full bg-muted" />
        <ChevronDown className="ml-auto h-3.5 w-3.5 opacity-50" />
      </span>
      <span className={`${PANE_CONTROL} h-7 w-7 justify-center`}><Wrench className="h-3.5 w-3.5" /></span>
      <span className={`${PANE_CONTROL} h-7 gap-1.5 whitespace-nowrap px-2 text-xs`}><PlusCircle className="h-3.5 w-3.5" />New project</span>
      <span className="ml-auto flex h-7 w-7 items-center justify-center"><Settings className="h-4 w-4" /></span>
    </header>
  );
}

function Preview() {
  return (
    <div className="relative min-h-0 max-sm:aspect-[4/3]" style={{ gridColumn: 1, gridRow: 1 }}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card/95">
        {/* The player letterboxes the 16:9 frame in the card; at rest its bar is play alone. */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center [container-type:size]" style={VIDEO_EDITOR_THEME_VARS}>
          <div className="aspect-video w-[min(100cqw,calc(100cqh*16/9))] bg-[var(--video-editor-stage-bg)]" />
          <div className="absolute inset-x-0 bottom-0 flex justify-center px-2 pb-2">
            <span className={`${PLAY_DISC} h-10 w-10`}><Play className="h-5 w-5 translate-x-px fill-current" strokeWidth={1.5} /></span>
          </div>
        </div>
      </div>
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-3 py-3">
        <div className="flex flex-col items-start gap-1">
          <span className={`${PANE_CONTROL} h-8 gap-1.5 px-2 text-xs`}>
            <Star className="h-3 w-3 fill-current text-primary" />Main<ChevronDown className="h-3.5 w-3.5 opacity-50" />
          </span>
          <span className="rounded-md border border-border/70 bg-card/90 px-1.5 py-0.5 font-mono text-[11px] tabular-nums tracking-[0.08em] text-muted-foreground">0:00.00</span>
        </div>
        {/* TimelineRenderControls' button, as the editor draws it. */}
        <Button type="button" size="sm" tabIndex={-1} className="h-8 gap-1.5 px-3 text-xs"><Download className="h-3.5 w-3.5" />Render</Button>
      </div>
    </div>
  );
}

function Toolbar() {
  return (
    <div className="min-w-0 max-sm:!col-span-1 max-sm:!me-0" style={{ ...WORK_AREA_STYLE, gridRow: 2 }}>
      <div className="relative flex h-7 items-center justify-between gap-2 rounded-lg border border-border/70 bg-card/95 px-2 text-muted-foreground">
        <div className="flex items-center gap-1">
          {/* Where the save badge sits once a timeline is open. */}
          <span className="w-11" />
          <Icon><Sparkles className="h-3.5 w-3.5" /></Icon><Icon><Undo2 className="h-3.5 w-3.5" /></Icon>
          <Icon><Redo2 className="h-3.5 w-3.5" /></Icon><Icon><History className="h-3.5 w-3.5" /></Icon>
        </div>
        <GripHorizontal className="absolute left-1/2 h-4 w-4 -translate-x-1/2 text-border" />
        <div className="flex items-center gap-1">
          <Icon><Maximize2 className="h-3.5 w-3.5" /></Icon><Icon><ZoomOut className="h-3.5 w-3.5" /></Icon>
          <Icon><ZoomIn className="h-3.5 w-3.5" /></Icon>
        </div>
      </div>
    </div>
  );
}

function Track({ label, icon, selected = false }: { label: string; icon: ReactNode; selected?: boolean }) {
  return (
    <div className="relative h-9 border-b border-border">
      <div className={`flex h-full items-center gap-1 border-r border-border px-2 text-xs text-foreground ${selected ? 'bg-accent/70' : 'bg-card'}`} style={{ width: LABEL_WIDTH }}>
        <span className="text-muted-foreground">{icon}</span>
        <span>{label}</span>
      </div>
    </div>
  );
}

function Timeline() {
  return (
    <div className="relative min-h-0 min-w-0 overflow-hidden max-sm:!col-span-1 max-sm:!me-0" style={{ ...WORK_AREA_STYLE, gridRow: 3 }}>
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card/95">
        <div className="flex h-full min-h-0 flex-col bg-background/70">
          <div className="relative h-[30px] shrink-0 overflow-hidden border-b border-border bg-card/80">
            <div className="absolute inset-y-0 left-0 border-r border-border/70 bg-card/90" style={{ width: LABEL_WIDTH }} />
            {RULER_TICKS.map((tick, index) => (
              <span key={tick} className="absolute top-[7px] rounded-sm bg-card/85 px-1 py-0.5 font-mono text-[10px] leading-[11px] tracking-[0.08em] text-muted-foreground" style={{ left: LABEL_WIDTH + 6 + index * 160 }}>{tick}</span>
            ))}
          </div>
          <div
            className="relative min-h-0 flex-1"
            style={{ backgroundImage: 'repeating-linear-gradient(to right, hsl(var(--border)) 0, hsl(var(--border)) 1px, transparent 1px, transparent 160px)', backgroundPosition: `${LABEL_WIDTH + 6}px 0`, backgroundSize: '100% 100%' }}
          >
            <Track label="V1" icon={<Video className="h-3.5 w-3.5" />} selected />
            <Track label="A1" icon={<Volume2 className="h-3.5 w-3.5" />} />
            <div className="absolute inset-y-0 left-0 border-r border-border bg-card/60" style={{ top: 72, width: LABEL_WIDTH }}>
              <div className="flex h-8 text-xs text-muted-foreground">
                <span className="flex flex-1 items-center justify-center border-r border-border">+ Video</span>
                <span className="flex flex-1 items-center justify-center">+ Audio</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dock() {
  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card/95 max-sm:hidden" style={{ gridColumn: 2, gridRow: '1 / -1', marginInlineStart: 12 }}>
      <div className="flex shrink-0 items-center gap-1 border-b border-border/70 px-2 py-1.5">
        <div className="flex min-w-0 flex-1 gap-1">
          <span className="flex min-h-8 items-center rounded-md bg-muted px-2.5 text-xs text-foreground">Inspector</span>
          <span className="flex min-h-8 items-center rounded-md px-2.5 text-xs text-muted-foreground">Extensions</span>
        </div>
        <span className={`${PANE_CONTROL} h-8 w-8 justify-center`}><PanelsTopLeft className="h-4 w-4" /></span>
      </div>
      <div className="min-h-0 flex-1 p-3">
        <div className="h-full rounded-xl border border-border bg-card/80 p-3">
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            Select a clip to edit timing, position, audio, text, or effects.
          </div>
        </div>
      </div>
    </section>
  );
}

/** The chat pane, locked open on desktop as `TasksPane` opens it on a first visit. */
function ChatPane() {
  return (
    <aside className="fixed inset-y-0 right-0 hidden w-[300px] flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl md:flex">
      <section className="mx-2 my-1 rounded-lg border border-amber-300/70 bg-amber-50/75 text-amber-950 shadow-sm dark:border-amber-800/70 dark:bg-amber-950/25 dark:text-amber-50">
        <div className="flex h-[38px] items-center justify-between gap-2 px-2.5">
          <span className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" />
            <span className="text-xs font-semibold">Activity</span>
            <span className="text-[11px] text-amber-900/60 dark:text-amber-100/60">No active tasks</span>
          </span>
          <span className="flex items-center gap-1"><Icon><ChevronDown className="h-3.5 w-3.5" /></Icon><Icon><Lock className="h-3.5 w-3.5" /></Icon></span>
        </div>
      </section>
      <div className="flex min-h-0 flex-1 flex-col border-t-2 border-sidebar-border bg-background/60">
        <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-1.5">
          <div className="flex flex-col items-start">
            <span className="flex h-7 items-center gap-1.5 rounded-md border border-border/70 bg-card/90 px-2 text-xs text-foreground">New chat<ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /></span>
            <span className="-ml-1.5 flex h-4 items-center gap-1 px-1.5 text-[11px] text-muted-foreground"><Sparkles className="h-3 w-3" />Astrid</span>
          </div>
          <span className="flex h-6 items-center self-start text-muted-foreground"><Icon><Plus className="h-3.5 w-3.5" /></Icon><ChevronDown className="-ml-1 h-3.5 w-3.5" /></span>
        </div>
        <div className="flex-1" />
        <div className="h-[209px] shrink-0 border-t border-border/70 p-3">
          <div className="relative h-full rounded-xl border border-border/70 bg-card">
            <div className="absolute inset-y-4 right-2 flex w-8 flex-col gap-2 text-muted-foreground">
              <span className="flex flex-1 items-center justify-center"><Mic className="h-3.5 w-3.5" /></span>
              <span className="flex flex-1 items-center justify-center rounded-full bg-primary/50 text-primary-foreground"><Send className="h-4 w-4" /></span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function EmptyEditorShell() {
  return (
    <div aria-hidden="true" {...({ inert: '' } as object)} className="pointer-events-none absolute inset-0 isolate select-none overflow-hidden">
      <AppSkyBackground />
      <div className="relative flex h-full flex-col md:mr-[300px]">
        <Header />
        {/* A phone stacks it as the editor does there: the preview across the top, the timeline under it, no dock. */}
        <main className="grid min-h-0 flex-1 gap-3 p-3 max-sm:![grid-template-columns:minmax(0,1fr)] max-sm:![grid-template-rows:auto_auto_minmax(0,1fr)]" style={GRID_STYLE}>
          <Preview />
          <Toolbar />
          <Timeline />
          <Dock />
        </main>
      </div>
      <ChatPane />
    </div>
  );
}
