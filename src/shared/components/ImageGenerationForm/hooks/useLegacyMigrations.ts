/**
 * useLegacyMigrations - Handles one-time data migrations for legacy formats
 */

import { useInvalidPointerCleanup } from './legacyMigrations/useInvalidPointerCleanup';
import { useLoraCategoryMigration } from './legacyMigrations/useLoraCategoryMigration';
import { useReferenceStructureMigration } from './legacyMigrations/useReferenceStructureMigration';
import { useSceneModeMigration } from './legacyMigrations/useSceneModeMigration';
import type { LegacyMigrationsInput } from './legacyMigrations/types';

/**
 * Revisit each migration hook and remove any that no longer serve users with
 * pre-migration project settings.
 */
export function useLegacyMigrations(input: LegacyMigrationsInput): void {
  const {
    selectedProjectId,
    effectiveShotId,
    referencePointers,
    hydratedReferences,
    selectedReferenceIdByShot,
    projectImageSettings,
    updateProjectImageSettings,
  } = input;

  useLoraCategoryMigration({
    projectImageSettings,
    selectedProjectId,
    updateProjectImageSettings,
  });

  useReferenceStructureMigration({
    projectImageSettings,
    selectedProjectId,
    effectiveShotId,
    updateProjectImageSettings,
  });

  useSceneModeMigration({
    projectImageSettings,
    referencePointers,
    selectedProjectId,
    updateProjectImageSettings,
  });

  useInvalidPointerCleanup({
    selectedProjectId,
    projectImageSettings,
    referencePointers,
    hydratedReferences,
    selectedReferenceIdByShot,
    updateProjectImageSettings,
  });
}
