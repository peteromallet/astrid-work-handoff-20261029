# Routing & Navigation

**Purpose**: Document non-obvious routing patterns, URL-state synchronization, and context availability.
**Source of Truth**: `src/app/routes.tsx`, `src/app/App.tsx`, `src/app/Layout.tsx`

## Route nesting

```
/home               HomeDocumentHandoff (no Layout): location.replace to the public site document
/pairing            PairingPage (no Layout)
/blog, /blog/:slug  Blog pages (no Layout)

<Layout>            Runtime gate + header + panes + Outlet
  /, /tools         DefaultToolRedirect (saved default tool, else /tools/video-editor)
  /tools/:toolName  Tool pages (main content area)
  /shots            ShotsPage
  /art              ArtPage
```

`*` renders `NotFoundPage`. There is no login, payments or share route (removed 2026-10-18, tag `pre-cloud-removal`). The four kept tools (`training-data-helper`, `edit-images`, `character-animate`, `edit-video`) keep their routes; they show "needs an online account" via `src/shared/lib/cloudBackend.ts` until a backend exists.

`Layout` redirects a session the Runtime has not authenticated to `APP_ENTRY_PATH` (visitors who chose the app) or `/home`; `/home` is a public document served outside this gate, so there is no loop. `/home` and `/vision` classify as public in every `VITE_APP_ENV` (`entryClassification.ts`).

## Context provider hierarchy (App.tsx)

All providers wrap the **entire** router (`AppProviders` in `src/app/providers/AppProviders.tsx`). Order matters for dependency:

| Layer (outer -> inner) | What it provides |
|---|---|
| `QueryClientProvider` / `TooltipProvider` | React Query, tooltips |
| `AuthProvider` + `AuthGate` | Local user (`LOCAL_USER_ID`) and Runtime connection gate |
| `TaskTypeConfigInitializer` | Task type config |
| `UserSettingsProvider` | UI settings (session-held, see `settings_system.md`) |
| `ProjectProvider` | `selectedProjectId`, `setSelectedProjectId` |
| `RealtimeProvider` | Poll-diff connection (see `realtime_system.md`) |
| `AstridShotsProvider` | `useShots()` data, scoped to selected project |
| `GenerationTaskProvider` | Active generation tasks |
| `IncomingTasksProvider` | Incoming task notifications |
| `PanesStoreBootstrapBoundary` | Pane open/locked/width state |
| `AgentChatProvider` | Agent chat handlers (null until the TasksPane panel registers) |
| `SelectionStoreBoundary` | Last-affected shot, reset on project change |
| `ToolPageHeaderProvider` | Injected header content per tool page |

Since all contexts are above the router, every route (including non-Layout routes) can access them. Layout adds the visual chrome (header, panes, footer) but not the data contexts.

## Shot selection via URL hash

Shot identity is encoded in the **hash fragment**, not a route param or query string:

```
/tools/travel-between-images#<shot-uuid>
```

`useShotNavigation` (`src/shared/hooks/shots/useShotNavigation.ts`) is the imperative API: `navigateToShot`, `navigateToNextShot`, `navigateToPreviousShot`, `navigateToShotEditor`. URLs are built by `travelShotUrl(shotId)`, or by `shotUrl(...)` when local-mode query params (`hasLocalModeUrlParams`) must be preserved (`src/shared/lib/tooling/toolRoutes.ts`). `navigateToShot` deliberately does **not** call `setCurrentShotId`: `navigate()` and the context update are not batched, so the URL/deep-link selection path owns the transition.

## Navigation state (`location.state`)

| State key | Type | Purpose |
|---|---|---|
| `fromShotClick` | `boolean` | Distinguishes intentional shot navigation from browser back. When `false` + no hash, the selection is cleared (back-to-list). |
| `shotData` | `Shot` | Optimistic shot data for newly created shots (avoids "not found" flash before cache syncs). |
| `isNewlyCreated` | `boolean` | Keeps a just-created shot from being treated as "not found" while caches sync. |
| `openSettings` | `boolean` | Triggers settings modal open from any route (checked in `Layout`). |
| `openSegmentSlot` | `string` | Deep-links to a specific segment slot in shot editor. |

## `useShotNavigation` behavior

- **`navigateToShot`**: Navigates with hash (does not set the context), scrolls to top, closes mobile panes. Passes `{ fromShotClick: true, shotData, isNewlyCreated }` in state.
- **`navigateToNextShot` / `navigateToPreviousShot`**: Always use `replace: true` (no history entry per shot when cycling).
- **`navigateToShotEditor`**: Clears `currentShotId`, navigates without hash.
- **Mobile**: Dispatches `mobilePaneOpen` event with `side: null` to close open panes.
- **Scroll**: Uses `requestAnimationFrame` + configurable delay. Also dispatches `app:scrollToTop` custom event for mobile split-view scroll container.

## Layout shot cleanup

`useResetCurrentShotOnRouteChange` (called from `Layout.tsx`) clears `currentShotId` when navigating **away from** `/tools/travel-between-images` (but not when navigating **to** it). This prevents stale shot state when switching tools.

## Key invariants

1. **Hash is truth for shot selection** -- `currentShotId` context and URL hash must agree; `navigateToShot` leaves the context update to the URL selection path.
2. **`fromShotClick` prevents accidental deselection** -- navigation without it and without a hash is treated as back-to-list.
3. **`replace: true` for prev/next** -- Cycling shots must not pollute browser history.
4. **Local-mode query params survive shot navigation** -- `shotUrl` keeps `localProject` and friends; dropping them would lose the document scope.
5. **All data contexts wrap the router** -- No context is Layout-only.
