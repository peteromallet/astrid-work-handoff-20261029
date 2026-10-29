import { useMemo } from 'react';
import type { HydratedReferenceImage } from '@/shared/types/referenceHydration';
import type { ReferenceImage } from '@/shared/types/referenceImage';
import { hydrateLegacyReference } from './referenceManagement/legacyReferenceMapping';

/**
 * Hydrates reference pointers into full reference objects.
 *
 * Only pointers that carry their image data inline can be hydrated: the
 * shared reference library that `resourceId` pointers resolved against has no
 * Runtime route, so a pointer with a `resourceId` and no inline image is
 * dropped from the result.
 */
export const useHydratedReferences = (
  referencePointers: ReferenceImage[] | undefined
): {
  hydratedReferences: HydratedReferenceImage[];
} => {
  return useMemo(() => ({
    hydratedReferences: (referencePointers ?? [])
      .filter((pointer) => !pointer.resourceId && !!pointer.styleReferenceImage)
      .map(hydrateLegacyReference),
  }), [referencePointers]);
};
