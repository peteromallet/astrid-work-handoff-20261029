import {useMutation} from '@tanstack/react-query';
import { useMemo } from 'react';
import type { UseMutationOptions, UseMutationResult } from '@tanstack/react-query';
import type { EffectMetadata, Resource } from '@/features/resources/hooks/useResources.ts';
import {
  createVideoEditorEffectCatalog,
  registryRecordToEffectResource,
  type EffectCategory,
  type EffectResource,
  type VideoEditorEffectCatalog,
} from '@/tools/video-editor/lib/effect-catalog.ts';
import { useOptionalEffectRegistryContext } from '@/tools/video-editor/effects/registry/EffectRegistryContext';
import { useOptionalEffectCatalog } from '@/tools/video-editor/runtime/catalogContexts.tsx';

export { EffectCatalogProvider } from '@/tools/video-editor/runtime/catalogContexts.tsx';

export type {
  CreateVideoEditorEffectInput,
  DeleteVideoEditorEffectInput,
  EffectCategory,
  EffectResource,
  EffectResourcesByCategory,
  UpdateVideoEditorEffectInput,
  VideoEditorEffectCatalog,
  VideoEditorEffectCatalogOptions,
} from '@/tools/video-editor/lib/effect-catalog.ts';

export {
  createVideoEditorEffectCatalog,
  registryRecordToEffectResource,
} from '@/tools/video-editor/lib/effect-catalog.ts';

/** Fallback catalog when no Runtime catalog is injected: provider-scoped registry records only. */
function useRegistryEffectCatalog(): VideoEditorEffectCatalog {
  const registryRecords = useOptionalEffectRegistryContext()?.snapshot?.records;
  return useMemo(() => createVideoEditorEffectCatalog({ registryRecords }), [registryRecords]);
}

export function useResolvedEffectCatalog(
  injectedCatalog?: VideoEditorEffectCatalog | null,
): VideoEditorEffectCatalog {
  const fallbackCatalog = useRegistryEffectCatalog();
  const selected=injectedCatalog??fallbackCatalog;
  return useMemo(()=>({...selected,canCreateEffect:false,canUpdateEffect:false,createEffect:undefined,updateEffect:undefined}),[selected]);
}

export function useEffectResources() {
  const injectedCatalog = useOptionalEffectCatalog();
  const fallbackCatalog = useRegistryEffectCatalog();
  const selected=injectedCatalog??fallbackCatalog;
  return useMemo(()=>({...selected,canCreateEffect:false,canUpdateEffect:false,createEffect:undefined,updateEffect:undefined}),[selected]);
}

export function useCreateEffectResource(): Omit<
  UseMutationResult<Resource, Error, { metadata: EffectMetadata }, unknown>,
  'mutate' | 'mutateAsync'
> & {
  mutate: UseMutationResult<Resource, Error, { metadata: EffectMetadata }, unknown>['mutate'];
  mutateAsync: (variables: { metadata: EffectMetadata }, options?: UseMutationOptions<Resource, Error, { metadata: EffectMetadata }, unknown>) => Promise<Resource>;
} {
  const mutation=useMutation<Resource,Error,{ metadata: EffectMetadata }>({mutationFn:async()=>{
    throw new Error('Custom element code must be authored and admitted through project pack files. Embedded resource source creation/update is unsupported.');
  }});
  return mutation as unknown as ReturnType<typeof useCreateEffectResource>;
}

export function useUpdateEffectResource(): Omit<
  UseMutationResult<Resource, Error, { id: string; metadata: EffectMetadata }, unknown>,
  'mutate' | 'mutateAsync'
> & {
  mutate: UseMutationResult<Resource, Error, { id: string; metadata: EffectMetadata }, unknown>['mutate'];
  mutateAsync: (variables: { id: string; metadata: EffectMetadata }, options?: UseMutationOptions<Resource, Error, { id: string; metadata: EffectMetadata }, unknown>) => Promise<Resource>;
} {
  const mutation=useMutation<Resource,Error,{ id: string; metadata: EffectMetadata }>({mutationFn:async()=>{
    throw new Error('Custom element code must be authored and admitted through project pack files. Embedded resource source creation/update is unsupported.');
  }});
  return mutation as unknown as ReturnType<typeof useUpdateEffectResource>;
}
