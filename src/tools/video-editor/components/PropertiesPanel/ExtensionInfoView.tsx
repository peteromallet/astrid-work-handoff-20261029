import type { AstridExtension } from '@astrid/editor-sdk';
import type { CommandRegistry } from '@/tools/video-editor/runtime/commandRegistry';

type Contribution = NonNullable<AstridExtension['manifest']['contributions']>[number];

// Plain-language nouns for what a contribution adds. Unknown kinds fall back to the raw kind.
const ADDS: Record<string, (name: string) => string> = {
  clipType: (name) => `${name} clips`,
  command: (name) => `${name} command`,
  panel: (name) => `${name} panel`,
  effect: (name) => `${name} effect`,
  transition: (name) => `${name} transition`,
  shader: (name) => `${name} shader`,
  parser: (name) => `${name} importer`,
  outputFormat: (name) => `${name} export format`,
  searchProvider: (name) => `${name} search`,
  metadataFacet: (name) => `${name} filter`,
  inspectorSection: (name) => `${name} inspector section`,
  assetDetailSection: (name) => `${name} asset details`,
  timelineOverlay: (name) => `${name} timeline overlay`,
  agentTool: (name) => `${name} agent tool`,
  keybinding: (name) => `${name} shortcut`,
  contextMenuItem: (name) => `${name} menu item`,
};

function nameOf(contribution: Contribution): string {
  const label = (contribution as { label?: unknown }).label;
  return typeof label === 'string' && label ? label : String(contribution.id);
}

/** What an enabled extension adds, for an extension that has no panel of its own. */
export function describeContributions(contributions: readonly Contribution[]): string[] {
  return contributions
    .filter((contribution) => contribution.kind !== 'keybinding')
    .map((contribution) => (ADDS[contribution.kind] ?? ((name: string) => `${name} (${contribution.kind})`))(nameOf(contribution)));
}

/** Compact info view: description, what the extension adds, and its commands as buttons. */
export function ExtensionInfoView({ extension, commandRegistry }: { extension: AstridExtension; commandRegistry?: Pick<CommandRegistry, 'executeCommand'> | null }) {
  const { manifest } = extension;
  const contributions = manifest.contributions ?? [];
  const adds = describeContributions(contributions);
  const commands = contributions.flatMap((contribution) => contribution.kind === 'command' && typeof (contribution as { command?: unknown }).command === 'string'
    ? [{ id: (contribution as unknown as { command: string }).command, label: nameOf(contribution) }]
    : []);
  return (
    <div data-testid="extension-info-view" className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3 text-sm">
      <p className="text-muted-foreground">{manifest.description ?? `${manifest.label} has no panel; it adds the following.`}</p>
      {adds.length > 0 && (
        <section aria-label="What it adds">
          <h3 className="mb-1 text-xs font-medium text-foreground">Adds</h3>
          <ul className="list-inside list-disc text-xs text-muted-foreground">{adds.map((line, index) => <li key={`${index}:${line}`}>{line}</li>)}</ul>
        </section>
      )}
      {commands.length > 0 && (
        <section aria-label="Commands" className="flex flex-wrap gap-1.5">
          {commands.map((command) => (
            <button key={command.id} type="button" disabled={!commandRegistry} className="min-h-10 rounded-md border border-border/70 bg-card/80 px-2 text-xs text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:min-h-8" onClick={() => { void commandRegistry?.executeCommand(command.id); }}>{command.label}</button>
          ))}
        </section>
      )}
    </div>
  );
}
