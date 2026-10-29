import { forwardRef, type ReactNode } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { AGENT_CHAT_COPY as copy } from '@/integrations/astrid/chatCopy.ts';
import type { LocalAgentId } from '@/integrations/astrid/localAgents.ts';
import { CopyFallback, useCopyAction } from '@/shared/components/RuntimeConnection/CopyInstallCommand.tsx';
import { Button } from '@/shared/components/ui/button.tsx';

interface TerminalNudgeProps {
  agent: LocalAgentId;
  /** The agent row's `terminal.command`: what to type in a terminal to talk to this agent. */
  command: string;
  projectName?: string | null;
  onDismiss: () => void;
}

/** A static picture of the terminal, not a live one: the request line is fixed copy, the project is the open one. */
export const TerminalNudge = forwardRef<HTMLElement, TerminalNudgeProps>(function TerminalNudge({ agent, command, projectName, onDismiss }, ref) {
  const commandCopy = useCopyAction(command);
  const CopyIcon = commandCopy.status === 'copied' ? Check : Copy;
  return <section ref={ref} tabIndex={-1} aria-labelledby="agent-terminal-nudge-title" data-testid="agent-terminal-nudge"
    className="space-y-2.5 rounded-xl border border-border/70 bg-card p-3 text-sm shadow-sm focus-visible:outline-none">
    <div className="flex items-start justify-between gap-2">
      <h3 id="agent-terminal-nudge-title" className="pt-0.5 text-[15px] leading-snug">{copy.terminalTitle}</h3>
      <Button type="button" variant="ghost" size="icon" aria-label={copy.terminalDismiss} title={copy.terminalDismiss} onClick={onDismiss}
        className="-mr-1.5 -mt-1 h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
        <X aria-hidden="true" />
      </Button>
    </div>
    <figure aria-label={copy.terminalPicture} className="overflow-hidden rounded-lg border border-border bg-muted/60 font-mono text-xs leading-5">
      <div className="flex items-center justify-between border-b border-border/70 pl-3 pr-0.5">
        <span aria-hidden="true" className="flex gap-1.5"><span className="h-2 w-2 rounded-full bg-muted-foreground/30" /><span className="h-2 w-2 rounded-full bg-muted-foreground/30" /><span className="h-2 w-2 rounded-full bg-muted-foreground/30" /></span>
        <button type="button" aria-label={copy.terminalCopy} title={copy.terminalCopy} onClick={() => void commandCopy.copy()}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
          <CopyIcon aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-1 px-3 py-2.5">
        <TerminalLine mark="$"><code className="text-foreground">{command}</code></TerminalLine>
        <TerminalLine mark=">"><span className="text-foreground">{copy.terminalExample}</span></TerminalLine>
        <TerminalLine mark="✓" markClassName="text-primary"><span className="text-muted-foreground">{copy.terminalResult(projectName)}</span></TerminalLine>
      </div>
    </figure>
    {commandCopy.status === 'failed' && <CopyFallback text={command} label={copy.terminalCopy} />}
    <p className="text-xs text-muted-foreground">{copy.terminalShowsUp}</p>
    {agent === 'astrid' && <p className="text-xs text-muted-foreground">{copy.terminalSameKey}</p>}
  </section>;
});

/** One terminal line: a fixed mark column, so wrapped text hangs under the text and not under the mark. */
function TerminalLine({ mark, markClassName = 'text-muted-foreground', children }: { mark: string; markClassName?: string; children: ReactNode }) {
  return <p className="flex min-w-0 gap-2"><span aria-hidden="true" className={`w-3 shrink-0 select-none text-center ${markClassName}`}>{mark}</span><span className="min-w-0 [overflow-wrap:anywhere]">{children}</span></p>;
}
