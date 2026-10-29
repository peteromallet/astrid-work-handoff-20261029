import { Fragment } from 'react';
import { Check, Copy } from 'lucide-react';
import { CopyFallback, useCopyAction } from '@/shared/components/RuntimeConnection/CopyInstallCommand.tsx';

const KEYCAP = 'select-all rounded border border-border px-1 font-mono text-[10px]';

function InlineCommand({ command }: { command: string }) {
  const commandCopy = useCopyAction(command);
  const Icon = commandCopy.status === 'copied' ? Check : Copy;
  return <>
    <code className={KEYCAP}>{command}</code>
    <button type="button" tabIndex={0} aria-label="Copy command" title="Copy command"
      className="relative ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded align-middle text-muted-foreground after:absolute after:-inset-1.5 after:content-[''] hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:after:-inset-3"
      onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); }}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); void commandCopy.copy(); }}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
    {commandCopy.status === 'failed' && <CopyFallback text={command} label="Copy command" />}
  </>;
}

/** Renders prose with each backticked command followed by its own copy action. */
export function CommandLine({ line }: { line: string }) {
  return <>{line.split(/`([^`]+)`/g).map((part, index) => index % 2 === 0
    ? part
    : <Fragment key={index}><InlineCommand command={part} /></Fragment>)}</>;
}

/** Renders one structured setup command on its own row. */
export function CommandStep({ command, label }: { command: string; label: string }) {
  const commandCopy = useCopyAction(command);
  const Icon = commandCopy.status === 'copied' ? Check : Copy;
  return <div>
    <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border/80 bg-muted/40 py-1 pl-3 pr-1">
      <pre className="min-w-0 flex-1 whitespace-pre-wrap py-1.5 [overflow-wrap:anywhere] font-mono text-xs leading-5 text-foreground"><code>{command}</code></pre>
      <button type="button" aria-label={label} title={label}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
        onClick={() => void commandCopy.copy()}>
        <Icon aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
    {commandCopy.status === 'failed' && <CopyFallback text={command} label={label} />}
  </div>;
}
