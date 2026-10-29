import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { EditorCard, EditorCardPage } from '@/shared/components/RuntimeConnection/EditorCard.tsx';
import { reportErrorBoundaryCatch } from '@/shared/lib/errorHandling/recoverableError';

/** True for the failures a stale hashed chunk produces after a redeploy. */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Loading chunk') ||
    message.includes('ChunkLoadError') ||
    message.includes('MIME type')
  );
}

interface ChunkLoadErrorBoundaryState {
  hasError: boolean;
}

/**
 * Error boundary that gives users a way out when a lazy chunk fails to load.
 *
 * This handles the common scenario where:
 * 1. User has cached old JS that references old chunk hashes
 * 2. New deployment changes chunk hashes
 * 3. Dynamic import fails because old chunk no longer exists
 *
 * Usage:
 * <ChunkLoadErrorBoundary>
 *   <React.Suspense fallback={null}>
 *     <LazyComponent />
 *   </React.Suspense>
 * </ChunkLoadErrorBoundary>
 */
export class ChunkLoadErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ChunkLoadErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ChunkLoadErrorBoundaryState {
    // Check if it's a chunk load error
    if (isChunkLoadError(error)) {
      return { hasError: true };
    }

    // Re-throw other errors
    throw error;
  }

  componentDidCatch(error: Error) {
    reportErrorBoundaryCatch({
      context: 'ChunkLoadErrorBoundary.componentDidCatch',
      error,
      recoveryAction: 'fallback',
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <EditorCardPage>
          <EditorCard title="Astrid was updated" sentence="Reload to get the new version.">
            <Button className="h-11 w-full rounded-xl" onClick={() => window.location.reload()} type="button">Reload</Button>
          </EditorCard>
        </EditorCardPage>
      );
    }

    return this.props.children;
  }
}
