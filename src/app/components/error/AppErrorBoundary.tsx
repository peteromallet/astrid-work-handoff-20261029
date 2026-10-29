import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { reportErrorBoundaryCatch } from '@/shared/lib/errorHandling/recoverableError';
import { isChunkLoadError } from '@/shared/runtime/ChunkLoadErrorBoundary';
import { ErrorDebugDetails } from '@/shared/components/error/ErrorDebugDetails';
import { ASTRID_HELP_URL } from '@/integrations/astrid/help.ts';
import { EditorCard, EditorCardFoot, EditorCardPage } from '@/shared/components/RuntimeConnection/EditorCard.tsx';

interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

/**
 * App-level error boundary that catches uncaught React errors
 * and displays a recovery UI instead of a white screen.
 *
 * This should wrap the entire app to catch any unhandled errors
 * that bubble up from components.
 */
export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    reportErrorBoundaryCatch({
      context: 'AppErrorBoundary.componentDidCatch',
      error,
      errorInfo,
      recoveryAction: 'fallback',
    });

    this.setState({ errorInfo });

    // In production, you might want to send this to an error tracking service
    // e.g., Sentry, LogRocket, etc.
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      const { error } = this.state;
      const isDev = import.meta.env.DEV;
      // A stale hashed chunk after a redeploy: a reload fetches the new build, retrying cannot.
      const isStale = isChunkLoadError(error);

      if (isStale) return <EditorCardPage><EditorCard title="Astrid was updated" sentence="Reload to get the new version.">
        <Button className="h-11 w-full rounded-xl" onClick={this.handleReload}>Reload</Button>
      </EditorCard></EditorCardPage>;
      return <EditorCardPage><EditorCard title="Something went wrong" sentence="This page ran into a problem. Try again, or reload the page."
        foot={<EditorCardFoot>Keeps happening? <a className="underline underline-offset-4 hover:text-foreground" href={ASTRID_HELP_URL} target="_blank" rel="noreferrer">Get help</a></EditorCardFoot>}>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button className="h-11 rounded-xl" onClick={this.handleReload}>Reload</Button>
          <Button className="h-11 rounded-xl" variant="outline" onClick={this.handleRetry}>Try again</Button>
        </div>
        {isDev && <div className="text-left"><ErrorDebugDetails error={error} isDev={isDev} /></div>}
      </EditorCard></EditorCardPage>;
    }

    return this.props.children;
  }
}
