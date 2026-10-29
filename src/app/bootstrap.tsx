import { initializeLoggerRuntime, reactProfilerOnRender } from '@/shared/lib/logger';
import { applyAppTheme, appThemeDarkness, readStoredAppThemeTime } from '@/shared/hooks/core/useAppTheme';
import { registerDebugGlobals } from '@/shared/lib/debug/debugConfig';

import { createRoot } from 'react-dom/client';
import { Profiler } from 'react';
import { App } from '@/app/App';
import { AppErrorBoundary } from '@/app/components/error/AppErrorBoundary';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { initializeToastManager } from '@/shared/runtime/toastRuntime';
import { installErrorNotifier } from '@/shared/lib/errorHandling/errorNotifier';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { notifyError } from '@/shared/lib/errorHandling/notifyError';
import { installRuntimeErrorPresenter } from '@/shared/lib/errorHandling/runtimeErrorPresenter';
import { initializeViewportLockRuntime } from '@/shared/runtime/viewportLockRuntime';
import { initializeProjectSelectionStore } from '@/shared/contexts/projectSelectionStore';
import { initializePreloadingService } from '@/shared/lib/preloading';
import { initializeNetworkStatusManager } from '@/shared/services/network/networkStatusManager';
import { initializeLocalTestRuntime, isLocalTestMode } from '@/app/localTestRuntime';
import '@/index.css';

let presenterInstalled = false;
const ERROR_NOTIFIER_OWNER = 'app-bootstrap';
let environmentInitialized = false;

interface RuntimeEnvironment {
  MODE?: string;
  DEV?: boolean;
  VITEST?: unknown;
}

function isTestRuntimeEnvironment(env: RuntimeEnvironment): boolean {
  return env.MODE === 'test' || Boolean(env.VITEST);
}

export function shouldLoadAutoplayMonitor(env: RuntimeEnvironment): boolean {
  return !isTestRuntimeEnvironment(env) && Boolean(env.DEV);
}

export function shouldLoadDevDebugTools(env: RuntimeEnvironment): boolean {
  return !isTestRuntimeEnvironment(env) && Boolean(env.DEV);
}

function registerToastErrorPresenter(): void {
  if (presenterInstalled) {
    return;
  }

  installRuntimeErrorPresenter((appError, toastTitle) => notifyError(appError, toastTitle));
  installErrorNotifier(({ title, description }) => {
    toast({
      title,
      description,
      variant: 'destructive',
    });
  }, ERROR_NOTIFIER_OWNER);
  presenterInstalled = true;
}

export function initializeAppEnvironment(): void {
  if (environmentInitialized) {
    return;
  }

  initializeLoggerRuntime();
  const env = import.meta.env;
  const localTestMode = isLocalTestMode(env);
  initializeLocalTestRuntime();
  initializeToastManager();
  registerToastErrorPresenter();
  initializeViewportLockRuntime();
  initializeProjectSelectionStore();
  initializePreloadingService();
  if (typeof window !== 'undefined' && !localTestMode) {
    initializeNetworkStatusManager();
  }

  // Initialize autoplay monitoring in development (after console suppression check)
  if (!localTestMode && shouldLoadAutoplayMonitor(env)) {
    import('@/shared/lib/debug/autoplayMonitor');
  }

  // Attach debugConfig to window for console access in dev
  if (!localTestMode && shouldLoadDevDebugTools(env)) {
    registerDebugGlobals();
  }

  // Debug tooling is intentionally loaded only for local dev runtime, never test/prod.
  if (!localTestMode && shouldLoadDevDebugTools(env)) {
    import('@/shared/lib/simpleCacheValidator');
    import('@/shared/lib/debug/debugPolling');
    import('@/shared/lib/debug/mobileProjectDebug');
    import('@/shared/realtime/DataFreshnessManager')
      .then(({ registerDataFreshnessManagerDebugGlobal }) => {
        registerDataFreshnessManagerDebugGlobal();
      })
      .catch((error) => {
        normalizeAndPresentError(error, {
          context: 'initializeAppEnvironment.registerDataFreshnessManagerDebugGlobal',
          showToast: false,
        });
        return undefined;
      });
  }

  // Paint the theme before the first frame (no flash of the wrong colours): the time of day where they
  // are, or the moment they chose.
  applyAppTheme(appThemeDarkness(readStoredAppThemeTime()));

  environmentInitialized = true;
}

export function renderApp(rootElement: HTMLElement): void {
  initializeAppEnvironment();
  createRoot(rootElement).render(
    <AppErrorBoundary>
      <Profiler id="Root" onRender={reactProfilerOnRender}>
        <App />
      </Profiler>
    </AppErrorBoundary>
  );
}
