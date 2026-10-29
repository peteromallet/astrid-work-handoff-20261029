import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AstridRuntimeClient } from '@/integrations/runtime/client';
import { useRuntimeConnection } from '@/integrations/runtime/RuntimeConnectionProvider';
import { AstridLoading } from '@/shared/components/AstridLoading';
import { RuntimeConnectorRecoveryBanner } from '@/shared/components/RuntimeConnection/RuntimeConnectorRecoveryBanner';
import { useRuntimeRequestWait } from '@/integrations/runtime/useRuntimeRequestWait.ts';
import { WorkspaceDiscoveryPending } from '@/shared/components/RuntimeConnection/WorkspaceDiscoveryPending.tsx';
import { hasRuntimeDocumentSelectors, normalizeRuntimeDocumentUrl } from './runtimeDocument';

/** Resolve the opening selection once the authenticated Runtime connection is ready. */
export function RuntimeDocumentNormalizationGate({ children }: { children: React.ReactNode }) {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const { isConnected } = useRuntimeConnection();
  const currentHref = `${pathname}${search}${hash}`;
  const currentHrefRef = useRef(currentHref);
  currentHrefRef.current = currentHref;
  const didInitialResolution = useRef(false);
  const [initialReady, setInitialReady] = useState(() => !hasRuntimeDocumentSelectors(search, pathname));
  const [failure, setFailure] = useState<Error | null>(null);
  const [retry, setRetry] = useState(0);
  const stillWaiting = useRuntimeRequestWait(isConnected && !failure, `${retry}:${currentHref}`);
  const readyForCurrentRoute = initialReady && (
    didInitialResolution.current || !hasRuntimeDocumentSelectors(search, pathname)
  );

  useEffect(() => {
    if (!isConnected || didInitialResolution.current) return;
    const initialPathname = pathname;
    const initialSearch = search;
    const initialHash = hash;
    if (!hasRuntimeDocumentSelectors(initialSearch, initialPathname)) {
      didInitialResolution.current = true;
      setInitialReady(true);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setFailure(null);
    void normalizeRuntimeDocumentUrl(
      new AstridRuntimeClient({ signal: controller.signal }),
      { pathname: initialPathname, search: initialSearch, hash: initialHash },
      (next) => {
        // Mark completion before the replacement rerenders this gate. Waiting
        // for the promise callback would let the new canonical location start
        // another catalog resolution during effect cleanup.
        didInitialResolution.current = true;
        navigate(next, { replace: true });
        setInitialReady(true);
      },
      () => !cancelled && currentHrefRef.current === `${initialPathname}${initialSearch}${initialHash}`,
    ).then(() => {
      if (!cancelled) {
        didInitialResolution.current = true;
        setInitialReady(true);
      }
    }).catch((error: unknown) => {
      if (!cancelled) setFailure(error instanceof Error ? error : new Error(String(error)));
    });
    return () => { cancelled = true; controller.abort(); };
  }, [hash, isConnected, navigate, pathname, retry, search]);

  if (readyForCurrentRoute) return <>{children}</>;
  if (failure) {
    return (
      <RuntimeConnectorRecoveryBanner
        error={failure}
        retrying={false}
        onRetry={() => setRetry((value) => value + 1)}
        failureSummary="Could not resolve the selected Runtime project and timeline. The original URL selection is preserved."
        projectId={new URLSearchParams(search).get('project')}
        timelineId={new URLSearchParams(search).get('timeline')}
      />
    );
  }
  if (!isConnected || !stillWaiting) return <><AstridLoading /><span data-boot-hold="" hidden /></>;
  return <WorkspaceDiscoveryPending
    waitedAlready
    key={currentHref}
    onRetry={() => setRetry(value => value + 1)}
    onOpenEditor={() => navigate('/tools/video-editor', { replace: true })}
  />;
}
