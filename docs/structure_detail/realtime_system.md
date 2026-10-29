# Realtime System

Keeps the UI in sync with Runtime changes. There is no WebSocket and no push channel: `RealtimeConnection` polls the Astrid local client routes, diffs successive reads into synthetic INSERT/UPDATE/DELETE events, and feeds them through React Query invalidation. The Supabase Realtime channel was removed 2026-10-18 (tag `pre-cloud-removal`).

## Architecture

```text
RealtimeConnection        interval diff-poller over AstridLocalClient routes
  - state: disconnected -> connecting -> connected <-> reconnecting -> failed
  - 'connected' only after the first fully successful poll cycle
  - reconnect backoff 1s-10s, max 5 attempts
        | raw events (diffed from poll snapshots)
        v
RealtimeEventProcessor    batches events in a 100ms window, groups by table:eventType
        | processed events
        v
useRealtimeInvalidation   all invalidation logic; reports affected queries
        v
DataFreshnessManager      per-query freshness; sets polling intervals via useSmartPolling
```

## Files

| File | Purpose |
|------|---------|
| `src/shared/realtime/RealtimeConnection.ts` | Poll engine, snapshots, diffing, reconnect state machine |
| `src/shared/realtime/RealtimeEventProcessor.ts` | Event batching and normalization |
| `src/shared/realtime/DataFreshnessManager.ts` | Polling decision engine |
| `src/shared/realtime/dataFreshness/pollingPolicy.ts` | Polling intervals by connection state |
| `src/shared/realtime/types.ts` | Type definitions |
| `src/shared/hooks/useRealtimeInvalidation.ts` | React Query invalidation logic |
| `src/shared/providers/RealtimeProvider.tsx` | Wires components, connects for the selected project, exposes status |

## Polled Tables

The first cycle seeds a baseline per table without emitting events; later cycles emit the diff.

| Table | Cadence | Notes |
|-------|---------|-------|
| `tasks` | 2s while any task is `queued`/`running`, else 60s; an immediate poll on `runtime:task-admitted` | Skipped when the Runtime-document task poller already reads the same list |
| `generations` | 2s | |
| `generation_variants` | 10s | No route of its own: projection rows derived from generation detail reads |
| `timelines` | 10s | |

## Processed Events

| Event Type | Triggers Invalidation When |
|------------|---------------------------|
| `tasks-created` | Always |
| `tasks-updated` | Always; + generation queries if a task completed |
| `generations-inserted` | Always |
| `generations-updated` | Only when location, thumbnail or starred changed (see `handleGenerationsUpdated`) |
| `generations-deleted` | Always |
| `variants-changed` / `variants-deleted` | Always |
| `timelines-updated` | Always (`timeline`, `asset-registry`, `timelines` keys) |

## Polling Fallback

`pollingPolicy.ts` returns the React Query `refetchInterval` per connection state:

| Condition | Polling Interval |
|-----------|------------------|
| Connected < 30s | 30s |
| Connected, event < 1 min old | **Disabled** |
| Connected, event 1-3 min old | 60s |
| Connected > 5 min, no events | **Disabled** (idle is normal) |
| Connected 30s-5 min otherwise | 60s safety net |
| Disconnected/error < 30s, then < 2 min, < 5 min, longer | 15s, 30s, 45s, 60s |
| Recent repeated failures (circuit breaker) | 60s |

A failed or hung read (10 s transport deadline) reports `error` to `DataFreshnessManager`; it never reports `connected`.

## Usage

```tsx
// App providers - wrap with provider
import { RealtimeProvider } from '@/shared/providers/RealtimeProvider';

// In components - access status
import { useRealtime } from '@/shared/providers/RealtimeProvider';

const { isConnected, isFailed, reconnect } = useRealtime();
```

## Debugging

Console log prefix: `[RealtimeConnection]` (connection lifecycle and failed polls).

Runtime diagnostics:
```javascript
window.__DATA_FRESHNESS_MANAGER__.getDiagnostics()
```
