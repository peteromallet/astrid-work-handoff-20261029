import { ReactNode } from 'react';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useRuntimeConnection } from '@/integrations/runtime/RuntimeConnectionProvider';
import { RuntimeConnectionPanel } from '@/shared/components/RuntimeConnection/RuntimeConnectionPanel';
import { RuntimeConnectorRecoveryBanner } from '@/shared/components/RuntimeConnection/RuntimeConnectorRecoveryBanner';
import { useLocation } from 'react-router-dom';
import { isWorkspaceRoute } from '@/app/runtime/runtimeDocument';

export const AuthGate = ({ children }: { children: ReactNode }) => {
  const { isLoading, authError, isRetryingAuth, retryAuth } = useAuth();
  const connection = useRuntimeConnection();
  const { pathname } = useLocation();

  // On the hosted build the wait is the Runtime probe (up to its timeout), so show the connecting state, not a blank page.
  // A workspace route passes straight to its connection gate, which draws the same screen and, once Astrid answers,
  // keeps it until the editor beneath has settled.
  if (isLoading) {
    if (!connection.gated) return null;
    return isWorkspaceRoute(pathname) ? <>{children}</> : <RuntimeConnectionPanel connection={connection} />;
  }

  // A failed same-origin boot probe remains unauthenticated. Keep the requested
  // route mounted behind a manual recovery action instead of redirecting away.
  if (authError && isWorkspaceRoute(pathname)) {
    return (
      <RuntimeConnectorRecoveryBanner
        error={authError}
        onRetry={retryAuth}
        retrying={isRetryingAuth}
        failureSummary="Astrid could not verify the local workspace connection. The current page and its URL are preserved."
        connectionUrl={typeof location === 'undefined' ? null : location.origin}
      />
    );
  }

  return <>{children}</>;
};
