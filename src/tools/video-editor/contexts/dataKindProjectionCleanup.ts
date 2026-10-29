import type { AstridExtension, DisposeHandle } from '@astrid/editor-sdk';
import type { DataKindItemsHost } from '@/tools/video-editor/data-kinds/dataKindItems.ts';
import type { ExtensionLifecycleHost } from '@/tools/video-editor/runtime/extensionLifecycle.ts';

function schemaRefs(extension: AstridExtension | undefined): Set<string> {
  return new Set((extension?.manifest.contributions ?? []).flatMap((contribution) =>
    contribution.kind === 'dataKind' && contribution.schemaRef ? [contribution.schemaRef] : []));
}

/** Clear projections only when their owner stops declaring that schema. */
export function subscribeToDataKindProjectionCleanup(
  lifecycleHost: ExtensionLifecycleHost,
  items: DataKindItemsHost | null | undefined,
  previousExtensions: readonly AstridExtension[],
  currentExtensions: readonly AstridExtension[],
): DisposeHandle {
  return lifecycleHost.onLifecycleDisposed((extensionId) => {
    const previous = previousExtensions.find((extension) => extension.manifest.id === extensionId);
    const previousSchemas = schemaRefs(previous);
    const current = currentExtensions.find((extension) => extension.manifest.id === extensionId);
    const currentSchemas = schemaRefs(current);
    for (const schemaRef of previousSchemas) {
      if (!currentSchemas.has(schemaRef)) items?.replaceTransient(schemaRef, []);
    }
  });
}
