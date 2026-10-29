import type { ReactNode } from 'react';
import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';
import { ASTRID_TOOL_CATALOG, resolveToolLaunch } from '@/shared/lib/tooling/toolCatalog';

/** Bind the new Video Editor route to its admitted Tool before mounting the existing page. */
export function ToolLaunchBoundary({ toolId, children }: { toolId: string; children: ReactNode }) {
  // Catalog absence must not withdraw unrelated, already-working host routes.
  if (toolId !== TOOL_IDS.VIDEO_EDITOR) return <>{children}</>;

  const resolution = resolveToolLaunch(ASTRID_TOOL_CATALOG, toolId);
  if (!resolution.available) {
    return (
      <main role="alert" data-testid="tool-unavailable" data-reason={resolution.reason}>
        <h1>Video Editor unavailable</h1>
        <p>This build does not contain a current, compatible Video Editor entry.</p>
      </main>
    );
  }
  return <>{children}</>;
}
