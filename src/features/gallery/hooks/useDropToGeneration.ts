import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { unifiedGenerationQueryKeys } from '@/shared/lib/queryKeys/unified';
import { RuntimeDataProvider } from '@/integrations/runtime/dataProvider';
import {
  assertRuntimeMediaImportSize,
  RUNTIME_MEDIA_IMPORT_MAX_BYTES,
} from '@/tools/video-editor/data/AssetResolver';
import { useResolvedGalleryProject } from '@/app/runtime/useResolvedGalleryProject';

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/');
}

export function useDropToGeneration(): (files: File[]) => Promise<void> {
  const queryClient = useQueryClient();
  const resolvedGalleryProject = useResolvedGalleryProject();
  const runtimeProjectId = resolvedGalleryProject.runtimeAuthority
    ? resolvedGalleryProject.projectId
    : null;
  const runtimeProvider = useMemo(
    () => runtimeProjectId ? new RuntimeDataProvider({ projectId: runtimeProjectId }) : null,
    [runtimeProjectId],
  );

  return useCallback(async (files: File[]) => {
    if (!runtimeProjectId || !runtimeProvider) {
      toast.error(resolvedGalleryProject.error?.message ?? 'Astrid Runtime project is not ready for media import.');
      return;
    }

    let insertedCount = 0;

    for (const file of files) {
      try {
        if (!isImageFile(file) && !isVideoFile(file)) {
          toast.error(`Unsupported file type: ${file.name}`);
          continue;
        }
        if (file.size > RUNTIME_MEDIA_IMPORT_MAX_BYTES) {
          assertRuntimeMediaImportSize(file);
        }

        await runtimeProvider.prepareMediaImport(file, {
          filename: file.name,
          mediaType: file.type || (isVideoFile(file) ? 'video/mp4' : 'image/png'),
        }).then((mediaImport) => {
          if (mediaImport.provider !== 'runtime' || mediaImport.project !== runtimeProjectId) {
            throw new Error('Runtime media import identity does not match the selected project');
          }
        });
        insertedCount += 1;
      } catch (error) {
        normalizeAndPresentError(error, {
          context: 'useDropToGeneration',
          toastTitle: `Failed to add ${file.name}`,
        });
      }
    }

    if (insertedCount > 0) {
      await queryClient.invalidateQueries({
        queryKey: ['runtime', ...unifiedGenerationQueryKeys.projectPrefix(runtimeProjectId)],
      });
    }
  }, [queryClient, resolvedGalleryProject, runtimeProjectId, runtimeProvider]);
}
