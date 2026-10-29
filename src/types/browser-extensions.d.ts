// Navigator extensions for device/network info
interface NetworkInformation extends EventTarget {
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g';
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

interface NavigatorWithDeviceInfo extends Navigator {
  deviceMemory?: number;
  connection?: NetworkInformation;
  standalone?: boolean; // iOS PWA
}

// Window extensions — all `window.__*` globals in one place.
//
// Categories:
//   [structural] — needed at runtime for non-React access to singletons
//   [debug]      — console helpers / instrumentation, should be gated behind import.meta.env.DEV
declare global {
  interface Window {
    // ── Debug-only globals (gate behind import.meta.env.DEV) ────────────
    /** [debug] React Query client reference — diagnostics only */
    __REACT_QUERY_CLIENT__?: import('@tanstack/react-query').QueryClient;
    /** [debug] Mobile project-context debug log entries */
    __projectDebugLog?: Array<{ timestamp: string; isMobile: boolean; projectsCount: number; selectedProjectId: string; isLoadingProjects: boolean; userAgent: string }>;
    /** [debug] DataFreshnessManager singleton for console diagnostics */
    __DATA_FRESHNESS_MANAGER__?: typeof import('../shared/realtime/DataFreshnessManager').dataFreshnessManager;
    /** [debug] NetworkStatusManager singleton for console diagnostics */
    __NETWORK_STATUS_MANAGER__?: import('../shared/lib/NetworkStatusManager').NetworkStatusManager;
    /** [debug] Mobile project debug utilities */
    debugMobile?: () => Record<string, unknown>;
    enableProjectDebug?: () => void;
    disableProjectDebug?: () => void;
    checkProjectState?: () => void;
    forceProjectRecovery?: () => void;
    getProjectDebugHistory?: () => unknown[];
    /** [debug] Network status console helper */
    checkNetworkStatus?: () => void;
    /** [debug] Network change simulator for testing */
    simulateNetworkChange?: (isOnline: boolean, effectiveType?: string) => void;
  }
}

export { NavigatorWithDeviceInfo, NetworkInformation };
