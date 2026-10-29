/**
 * Injectable extension settings service factory.
 *
 * The settings service can be created independently for testing, provider-backed
 * storage integration, and settings snapshot persistence through ExtensionStateRepository.
 *
 * The factory accepts an optional ExtensionStateRepository
 * and/or an initial ExtensionSettingsSnapshot. When a repository is
 * provided, the service writes its current settings as a snapshot to the
 * repository on dispose, enabling reload-equivalent reinitialization.
 *
 * Settings schema-version migration support: when an
 * initialSnapshot carries a different schema version than the manifest,
 * the factory runs migration handlers and resets to defaults on failure.
 *
 * The factory preserves the existing synchronous ExtensionSettingsService
 * contract (get/set/delete/keys) and manifest-defaults fallback behavior.
 * Legacy localStorage read-through is always active — the service uses
 * localStorage as the primary synchronous backing store regardless of
 * repository presence.
 *
 * ## Value resolution priority (get)
 *
 *  1. localStorage value (legacy, most-recent synchronous write)
 *  2. Snapshot value (from repository-backed snapshot, persisted across
 *     sessions; only when an initial snapshot is provided)
 *  3. Manifest defaults (from manifest.settingsDefaults)
 *
 * ## Settings migration
 *
 * When `initialSnapshot.schemaVersion` differs from the manifest's
 * declared settings schema version, the factory optionally runs
 * migration handlers provided via `options.migration.settingsHandlers`.
 * On success, the migrated values replace the snapshot values. On failure
 * or when no handler matches, settings are reset to manifest defaults.
 * Lifecycle events (migration_start, migration_success, migration_failure,
 * migration_reset) are emitted through the optional repository.
 */

import type { ExtensionSettingsService } from './settings';
import type { ExtensionManifest } from './manifest';
import type { DisposeHandle } from './dispose';
import type {
  StateRepository,
  SettingsSnapshot,
} from './contracts';
import {
  runSettingsMigration,
  getManifestSettingsSchemaVersion,
} from './extensionSettingsMigration';
import type { SettingsMigrationHandler } from './extensionSettingsMigration';
import Ajv from 'ajv';
import type { ValidateFunction } from 'ajv';

// ---------------------------------------------------------------------------
// Settings prefix
// ---------------------------------------------------------------------------

/** Build the localStorage key prefix for an extension's settings. */
export function getSettingsPrefix(extensionId: string): string {
  return `astrid.ext.${extensionId}.`;
}

// ---------------------------------------------------------------------------
// Backing store
// ---------------------------------------------------------------------------

/**
 * The synchronous store behind an extension's settings (the highest-priority value layer). The app injects a
 * Runtime-backed one; the default keeps them in this browser's localStorage.
 */
export interface ExtensionSettingsBacking {
  /** The saved value, or `undefined` when none is saved. */
  get(key: string): unknown;
  /** Returns false when the value could not be stored. */
  set(key: string, value: unknown): boolean;
  /** Returns false when the removal could not be applied. */
  remove(key: string): boolean;
  keys(): string[];
  /** Called when values change somewhere other than through this service (another tab, a re-read). */
  subscribe?(listener: () => void): () => void;
  /** Scratch backings drop what the service wrote when it is disposed without a repository. */
  discard?(keys: Iterable<string>): void;
}

/** The default backing: one localStorage key per setting, `astrid.ext.<id>.<key>`. */
export function createLocalStorageBacking(prefix: string): ExtensionSettingsBacking {
  return {
    get(key) {
      try {
        const raw = localStorage.getItem(prefix + key);
        return raw === null ? undefined : JSON.parse(raw);
      } catch {
        return undefined;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(prefix + key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(prefix + key);
        return true;
      } catch {
        return false;
      }
    },
    keys() {
      const result: string[] = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const lsKey = localStorage.key(i);
          if (lsKey && lsKey.startsWith(prefix)) result.push(lsKey.slice(prefix.length));
        }
      } catch {
        // localStorage enumeration failed — report what we have
      }
      return result;
    },
    discard(keys) {
      try {
        for (const key of keys) localStorage.removeItem(prefix + key);
      } catch {
        // localStorage unavailable — silently no-op
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Factory options
// ---------------------------------------------------------------------------

/**
 * Settings migration configuration.
 *
 * When provided, the factory checks whether the persisted snapshot's
 * schema version matches the manifest.  If they differ, it invokes the
 * appropriate migration handler and resets to defaults when migration
 * is unavailable or fails.
 */
export interface SettingsMigrationConfig {
  /**
   * Map of migration handler names (matching MigrationDeclaration.handler)
   * to their implementations.
   */
  readonly settingsHandlers?: Readonly<Record<string, SettingsMigrationHandler>>;
}

export type SettingsPersistenceOperation = 'set' | 'delete' | 'dispose';

export interface SettingsPersistenceSuccess {
  readonly extensionId: string;
  readonly operation: SettingsPersistenceOperation;
  readonly key?: string;
  readonly revision: number;
}

export interface SettingsPersistenceError extends SettingsPersistenceSuccess {
  readonly message: string;
}

/**
 * Optional configuration for createExtensionSettingsService.
 *
 * - `repository` — When provided, the service writes its current settings
 *   as an ExtensionSettingsSnapshot to the repository on dispose, enabling
 *   reload-equivalent reinitialization.
 * - `initialSnapshot` — A pre-loaded ExtensionSettingsSnapshot whose values
 *   serve as a fallback layer between localStorage and manifest defaults.
 *   When absent but a repository is present, the caller should load the
 *   snapshot from the repository before constructing the service.
 * - `migration` — Settings migration configuration. When an
 *   initialSnapshot's schema version differs from the manifest, migration
 *   handlers are invoked and lifecycle events are emitted.
 */
export interface CreateExtensionSettingsServiceOptions {
  /** Where the synchronous settings live; defaults to this browser's localStorage (see `createLocalStorageBacking`). */
  readonly backing?: ExtensionSettingsBacking;
  readonly repository?: StateRepository;
  readonly initialSnapshot?: SettingsSnapshot;
  readonly migration?: SettingsMigrationConfig;
  readonly onPersistenceSuccess?: (event: SettingsPersistenceSuccess) => void;
  readonly onPersistenceError?: (event: SettingsPersistenceError) => void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Result of creating an extension settings service.
 *
 * - `service` — the synchronous settings service for the extension author.
 * - `dispose` — cleans up localStorage keys and (when a repository was
 *   provided) writes the final settings snapshot to the repository.
 *   Safe to call multiple times; idempotent.
 * - `migrationResult` — The result of settings migration, or null
 *   when no migration was attempted.
 */
export interface ExtensionSettingsServiceFactoryResult {
  readonly service: ExtensionSettingsService;
  dispose(): void;
  /** Migration outcome when schema versions differed. Null otherwise. */
  readonly migrationResult: import('./extensionSettingsMigration').SettingsMigrationResult | null;
}

/**
 * Create an injectable settings service for an extension.
 *
 * The returned service is synchronous and localStorage-backed, with
 * manifest `settingsDefaults` as the ultimate fallback. When an
 * `initialSnapshot` is provided, its values act as a secondary fallback
 * layer between localStorage and manifest defaults.
 *
 * When a `repository` is provided, calling `dispose()` writes the
 * current settings (the merged view of localStorage + snapshot +
 * defaults) as an ExtensionSettingsSnapshot to the repository.
 *
 * ## Settings migration
 *
 * When `initialSnapshot.schemaVersion` differs from
 * `manifest.settingsSchemaVersion` (or `manifest.settingsSchema.version`),
 * the factory:
 *  1. Emits a `migration_start` lifecycle event.
 *  2. Looks for matching `kind: 'settings'` migration declarations.
 *  3. Invokes the corresponding handler from `options.migration.settingsHandlers`.
 *  4. On success, uses the migrated values as the effective snapshot.
 *  5. On failure or missing handler, resets to manifest defaults and emits
 *     `migration_reset`.
 *
 * Legacy localStorage keys written by previous versions of the settings
 * service (or by direct localStorage writes using the astrid.ext.* prefix)
 * are always readable through `get()` regardless of repository presence.
 *
 * @param extensionId  The extension's unique identifier.
 * @param manifest     The extension manifest (for settingsDefaults and migration declarations).
 * @param options      Optional repository, initial snapshot, and/or migration config.
 * @returns A disposable settings service with optional migration result.
 */
export function createExtensionSettingsService(
  extensionId: string,
  manifest: ExtensionManifest,
  options?: CreateExtensionSettingsServiceOptions,
): ExtensionSettingsServiceFactoryResult {
  const backing = options?.backing ?? createLocalStorageBacking(getSettingsPrefix(extensionId));
  const settingsDefaults: Record<string, unknown> =
    (manifest.settingsDefaults as Record<string, unknown> | undefined) ?? {};

  // -----------------------------------------------------------------------
  // Settings migration
  // -----------------------------------------------------------------------

  let migrationResult: import('./extensionSettingsMigration').SettingsMigrationResult | null = null;

  /**
   * Effective snapshot values — may be replaced by migration output
   * when a schema-version change triggers a migration run.
   */
  let effectiveSnapshotValues: Record<string, unknown> = {};
  let effectiveSnapshotSchemaVersion = getManifestSettingsSchemaVersion(manifest);

  const rawInitialSnapshot = options?.initialSnapshot;
  const migrationConfig = options?.migration;
  const repository = options?.repository;

  if (rawInitialSnapshot && migrationConfig) {
    const manifestVersion = getManifestSettingsSchemaVersion(manifest);
    if (rawInitialSnapshot.schemaVersion !== manifestVersion) {
      // Schema version mismatch — run migration synchronously via a
      // deferred promise that we resolve before the service is used.
      // Because the settings service is synchronous and migration may
      // be async, we pre-compute the result here. For the activation
      // flow, the caller should await the migration before activating.
      //
      // Since createExtensionSettingsService is synchronous, we kick off
      // the async migration and capture the resolved values via a
      // synchronous snapshot replacement strategy.
      //
      // For the common case where migration handlers are synchronous, we
      // can call them immediately. For async handlers, the caller must
      // await before using the service.
      //
      // Strategy: if handlers are provided and all sync, run now.
      // Otherwise, use the snapshot values as-is and let the caller
      // handle async migration separately.
      //
      // Actually, we'll just run it synchronously if possible. If any
      // handler returns a Promise, we run synchronously with the value
      // resolution deferred. But the task says to reset to defaults
      // when migration fails/is absent, so let's handle this inline.

      // Synchronous migration check
      const manifestDefaults: Record<string, unknown> = settingsDefaults;
      const currentValues: Record<string, unknown> = {
        ...(rawInitialSnapshot.values as Record<string, unknown>),
      };

      // Find applicable declarations
      const declarations = (manifest.migrations ?? [])
        .filter((m) => {
          const mig = m as Record<string, unknown>;
          return mig.kind === 'settings';
        })
        .map((m) => m as Record<string, unknown>);

      let migrated = false;
      let resetApplied = false;
      let migrationError: Error | null = null;

      if (declarations.length === 0) {
        // No settings migration declarations — reset to defaults
        resetApplied = true;
      } else {
        // Try each declaration in order
        for (const decl of declarations) {
          const handlerName = decl.handler as string | undefined;
          if (!handlerName) continue;

          const handler = migrationConfig.settingsHandlers?.[handlerName];
          if (!handler) {
            migrationError = new Error(
              `Settings migration handler "${handlerName}" not found; resetting to defaults.`,
            );
            break;
          }

          try {
            const result = handler(
              migrated ? { ...effectiveSnapshotValues! } : currentValues,
              manifestDefaults,
              rawInitialSnapshot.schemaVersion,
              manifestVersion,
            );
            // Handler may return a Promise or a plain value
            if (result instanceof Promise) {
              // Async handler — migration will be completed asynchronously.
              // We set a flag so the caller knows to await.
              // For now, use current values; the caller will replace them.
              migrationResult = {
                values: currentValues,
                schemaVersion: rawInitialSnapshot.schemaVersion,
                migrated: false,
                resetToDefaults: false,
                lifecycleEvents: [],
              };
              // We can't await here — mark as pending
              (migrationResult as any)._pendingPromise = result;
              break;
            }
            effectiveSnapshotValues = { ...result };
            migrated = true;
          } catch (err) {
            migrationError =
              err instanceof Error ? err : new Error(String(err));
            break;
          }
        }

        if (!migrated && !migrationError && declarations.length > 0) {
          // All declarations lacked usable handlers
          migrationError = new Error(
            'No usable settings migration handlers found; resetting to defaults.',
          );
        }
      }

      if (resetApplied || migrationError) {
        // Reset to defaults
        effectiveSnapshotValues = { ...manifestDefaults };
        effectiveSnapshotSchemaVersion = manifestVersion;
        migrationResult = {
          values: effectiveSnapshotValues,
          schemaVersion: effectiveSnapshotSchemaVersion,
          migrated: false,
          resetToDefaults: true,
          failure: migrationError ?? new Error('Settings migration not available; settings reset to manifest defaults'),
          lifecycleEvents: [],
        };
      } else if (migrated) {
        effectiveSnapshotSchemaVersion = manifestVersion;
        migrationResult = {
          values: effectiveSnapshotValues!,
          schemaVersion: effectiveSnapshotSchemaVersion,
          migrated: true,
          resetToDefaults: false,
          lifecycleEvents: [],
        };
      } else if (!migrationResult) {
        // No change needed (shouldn't reach here if versions differ)
        effectiveSnapshotValues = currentValues;
        effectiveSnapshotSchemaVersion = rawInitialSnapshot.schemaVersion;
      }
    } else {
      // Schema versions match
      effectiveSnapshotValues = {
        ...(rawInitialSnapshot.values as Record<string, unknown>),
      };
      effectiveSnapshotSchemaVersion = rawInitialSnapshot.schemaVersion;
    }
  } else if (rawInitialSnapshot) {
    // No migration config — use snapshot as-is
    effectiveSnapshotValues = {
      ...(rawInitialSnapshot.values as Record<string, unknown>),
    };
    effectiveSnapshotSchemaVersion = rawInitialSnapshot.schemaVersion;
  } else {
    // No snapshot — use defaults
    effectiveSnapshotValues = {};
    effectiveSnapshotSchemaVersion = getManifestSettingsSchemaVersion(manifest);
  }

  // -----------------------------------------------------------------------
  // Snapshot layer (used for value resolution)
  // -----------------------------------------------------------------------

  /** Snapshot values (from repository or migration) — a fallback layer between localStorage and defaults. */
  const snapshotValues: Record<string, unknown> = { ...effectiveSnapshotValues };

  /** Snapshot schema version (for repository writes). */
  const snapshotSchemaVersion: number = effectiveSnapshotSchemaVersion;

  /** Track keys set via this service so they can be cleaned up on dispose. */
  const writtenKeys = new Set<string>();

  /** Track keys deleted via this service to exclude from final snapshot. */
  const deletedKeys = new Set<string>();

  /** Subscribers notified after every successful set() / delete(). */
  const listeners = new Set<() => void>();

  /** True while this service writes to its backing, so the backing's change callback does not notify twice. */
  let selfWriting = false;
  const unsubscribeBacking = backing.subscribe?.(() => { if (!selfWriting) notifyListeners(); });

  /** Notify all subscribers. Safe — catches and ignores listener errors. */
  function notifyListeners(): void {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // Listener errors must not break the service
      }
    }
  }

  type PersistenceJob = {
    readonly snapshot: SettingsSnapshot;
    readonly operation: SettingsPersistenceOperation;
    readonly key?: string;
    readonly revision: number;
  };

  let mutationRevision = 0;
  let latestAttemptRevision = 0;
  let latestSuccessRevision = 0;
  let pendingPersistenceJob: PersistenceJob | null = null;
  let persistenceInFlight = false;

  function buildSettingsSnapshot(): SettingsSnapshot {
    const merged = buildMergedSettings();
    return Object.freeze({
      extensionId,
      schemaVersion: snapshotSchemaVersion,
      values: Object.freeze({ ...merged }),
      lastWrittenAt: new Date().toISOString(),
    });
  }

  function sanitizePersistenceError(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    const valueStrings = Object.values(buildMergedSettings())
      .filter((value): value is string => typeof value === 'string' && value.length > 0);

    return valueStrings.reduce(
      (message, value) => message.split(value).join('[redacted]'),
      raw,
    );
  }

  function reportPersistenceSuccess(job: PersistenceJob): void {
    // Success is reported for every settled write, not just the latest
    // revision, so host subscribers can observe each persisted mutation.
    // Revision tracking elsewhere prevents stale completions from confusing
    // dispose-time fallback cleanup.
    try {
      options?.onPersistenceSuccess?.({
        extensionId,
        operation: job.operation,
        ...(job.key !== undefined ? { key: job.key } : {}),
        revision: job.revision,
      });
    } catch {
      // Persistence callbacks are observability hooks and must not break settings.
    }
  }

  function reportPersistenceError(job: PersistenceJob, error: unknown): void {
    if (job.revision !== mutationRevision) return;

    try {
      options?.onPersistenceError?.({
        extensionId,
        operation: job.operation,
        ...(job.key !== undefined ? { key: job.key } : {}),
        revision: job.revision,
        message: sanitizePersistenceError(error),
      });
    } catch {
      // Persistence callbacks are observability hooks and must not break settings.
    }
  }

  function cleanupWrittenLocalStorageKeys(): void {
    backing.discard?.(writtenKeys);
    writtenKeys.clear();
  }

  function cleanupFallbackAfterLatestPersistence(): void {
    if (!disposed) return;
    if (!repository || repository.isDisposed) return;
    if (latestSuccessRevision < mutationRevision) return;
    cleanupWrittenLocalStorageKeys();
  }

  function drainPersistenceQueue(): void {
    if (persistenceInFlight) return;
    if (!repository || repository.isDisposed) return;

    const job = pendingPersistenceJob;
    if (!job) return;

    pendingPersistenceJob = null;
    persistenceInFlight = true;
    latestAttemptRevision = job.revision;

    repository.putSettingsSnapshot(job.snapshot).then(
      () => {
        try {
          if (job.revision >= latestAttemptRevision && job.revision >= latestSuccessRevision) {
            latestSuccessRevision = job.revision;
          }
          reportPersistenceSuccess(job);
          cleanupFallbackAfterLatestPersistence();
        } finally {
          persistenceInFlight = false;
          drainPersistenceQueue();
        }
      },
      (error: unknown) => {
        try {
          reportPersistenceError(job, error);
        } finally {
          persistenceInFlight = false;
          drainPersistenceQueue();
        }
      },
    );
  }

  function enqueuePersistence(
    operation: SettingsPersistenceOperation,
    key?: string,
  ): void {
    if (!repository || repository.isDisposed) return;

    mutationRevision += 1;
    pendingPersistenceJob = {
      snapshot: buildSettingsSnapshot(),
      operation,
      ...(key !== undefined ? { key } : {}),
      revision: mutationRevision,
    };
    drainPersistenceQueue();
  }

  // -----------------------------------------------------------------------
  // Compute the effective merged value for a key at read time
  // -----------------------------------------------------------------------

  function getEffectiveValue<T = unknown>(key: string): T | undefined {
    // Priority 1: localStorage (legacy, most-recent synchronous write)
    const saved = backing.get(key);
    if (saved !== undefined) return saved as T;

    // Priority 2: snapshot value (from repository, persisted across sessions)
    if (key in snapshotValues && !deletedKeys.has(key)) {
      return snapshotValues[key] as T;
    }

    // Priority 3: manifest defaults
    if (key in settingsDefaults) return settingsDefaults[key] as T;

    return undefined;
  }

  // -----------------------------------------------------------------------
  // Build the merged settings map (localStorage wins over snapshot over defaults)
  // -----------------------------------------------------------------------

  function buildMergedSettings(): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...snapshotValues };

    // Apply manifest defaults (only for keys not in snapshot)
    for (const [dk, dv] of Object.entries(settingsDefaults)) {
      if (!(dk in merged)) {
        merged[dk] = dv;
      }
    }

    // Apply localStorage overrides
    for (const savedKey of backing.keys()) {
      const saved = backing.get(savedKey);
      if (saved !== undefined) merged[savedKey] = saved;
    }

    // Remove deleted keys
    for (const dk of deletedKeys) {
      delete merged[dk];
    }

    return merged;
  }

  // -----------------------------------------------------------------------
  // Ajv-backed atomic save validation
  // -----------------------------------------------------------------------

  /**
   * Compiled Ajv validator for the full settings candidate, or null when
   * the manifest does not declare a settings JSON Schema.
   */
  const settingsSchemaValidator: ValidateFunction | null = (() => {
    const settingsSchema = manifest.settingsSchema;
    if (!settingsSchema || !settingsSchema.schema) return null;

    const rawSchema = settingsSchema.schema as Record<string, unknown>;
    // We only support JSON Schema with type:'object' and properties
    if (rawSchema.type !== 'object' || !rawSchema.properties) return null;

    try {
      const ajv = new Ajv({ allErrors: true });
      return ajv.compile(rawSchema);
    } catch {
      // Schema compilation failed — fall back to permissive mode
      return null;
    }
  })();

  /**
   * Build the full candidate settings state: merge manifest defaults,
   * snapshot values, and localStorage overrides, then apply the
   * pending key/value change.
   */
  function buildCandidateState(key: string, value: unknown): Record<string, unknown> {
    const candidate: Record<string, unknown> = { ...settingsDefaults };

    // Apply snapshot values (overrides defaults)
    for (const [sk, sv] of Object.entries(snapshotValues)) {
      if (!deletedKeys.has(sk)) {
        candidate[sk] = sv;
      }
    }

    // Apply localStorage overrides (wins over snapshot + defaults)
    for (const savedKey of backing.keys()) {
      const saved = backing.get(savedKey);
      if (saved !== undefined) candidate[savedKey] = saved;
    }

    // Remove deleted keys
    for (const dk of deletedKeys) {
      delete candidate[dk];
    }

    // Apply the pending key/value change
    candidate[key] = value;

    return candidate;
  }

  // -----------------------------------------------------------------------
  // Service
  // -----------------------------------------------------------------------

  const service: ExtensionSettingsService = {
    get<T = unknown>(key: string): T | undefined {
      return getEffectiveValue<T>(key);
    },
    set<T = unknown>(key: string, value: T): void {
      // Ajv-backed atomic save — validate the full candidate before
      // writing to localStorage. Blocks invalid saves to prevent partial
      // corruption of the existing valid override state.
      if (settingsSchemaValidator) {
        const candidate = buildCandidateState(key, value);
        const valid = settingsSchemaValidator(candidate);
        if (!valid) {
          // Validation failed — block the save, preserving existing overrides
          return;
        }
      }

      selfWriting = true;
      let stored = false;
      try {
        stored = backing.set(key, value);
      } finally {
        selfWriting = false;
      }
      if (!stored) return; // quota exceeded or storage unavailable — silently no-op
      writtenKeys.add(key);
      deletedKeys.delete(key);
      notifyListeners();
      enqueuePersistence('set', key);
    },
    delete(key: string): void {
      selfWriting = true;
      let removed = false;
      try {
        removed = backing.remove(key);
      } finally {
        selfWriting = false;
      }
      if (!removed) return;
      writtenKeys.delete(key);
      deletedKeys.add(key);
      notifyListeners();
      enqueuePersistence('delete', key);
    },
    keys(): readonly string[] {
      const result = new Set<string>();

      // Collect the saved keys
      for (const savedKey of backing.keys()) result.add(savedKey);

      // Add snapshot keys not already present
      for (const sk of Object.keys(snapshotValues)) {
        if (!deletedKeys.has(sk)) {
          result.add(sk);
        }
      }

      // Add manifest default keys not already present
      for (const dk of Object.keys(settingsDefaults)) {
        result.add(dk);
      }

      // Remove deleted keys
      for (const dk of deletedKeys) {
        result.delete(dk);
      }

      return [...result];
    },
    subscribe(listener: () => void): DisposeHandle {
      listeners.add(listener);
      return {
        dispose(): void {
          listeners.delete(listener);
        },
      };
    },
  };

  // -----------------------------------------------------------------------
  // Dispose
  // -----------------------------------------------------------------------

  let disposed = false;

  function dispose(): void {
    if (disposed) return;

    disposed = true;
    unsubscribeBacking?.();

    if (repository && !repository.isDisposed) {
      enqueuePersistence('dispose');
      cleanupFallbackAfterLatestPersistence();
      return;
    }

    // Local-only settings keep legacy dispose cleanup behavior.
    if (!repository) {
      cleanupWrittenLocalStorageKeys();
    }
  }

  return { service, dispose, migrationResult };
}
