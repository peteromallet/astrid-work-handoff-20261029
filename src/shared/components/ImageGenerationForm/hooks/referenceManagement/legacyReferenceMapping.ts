import type { HydratedReferenceImage } from '@/shared/types/referenceHydration';
import type { ReferenceImage } from '@/shared/types/referenceImage';

export function hydrateLegacyReference(pointer: ReferenceImage): HydratedReferenceImage {
  return {
    id: pointer.id,
    resourceId: '',
    name: pointer.name || 'Reference',
    styleReferenceImage: pointer.styleReferenceImage || '',
    styleReferenceImageOriginal: pointer.styleReferenceImageOriginal || '',
    thumbnailUrl: pointer.thumbnailUrl || null,
    styleReferenceStrength: pointer.styleReferenceStrength ?? 1.1,
    subjectStrength: pointer.subjectStrength ?? 0.0,
    subjectDescription: pointer.subjectDescription || '',
    inThisScene: pointer.inThisScene ?? false,
    inThisSceneStrength: pointer.inThisSceneStrength ?? 1.0,
    referenceMode: pointer.referenceMode || 'style',
    styleBoostTerms: pointer.styleBoostTerms || '',
    createdAt: pointer.createdAt || new Date().toISOString(),
    updatedAt: pointer.updatedAt || new Date().toISOString(),
    isPublic: false,
    isOwner: true,
  };
}
