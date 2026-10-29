import {useMutation} from '@tanstack/react-query';
import { useMemo } from 'react';
import type { UseMutationOptions, UseMutationResult } from '@tanstack/react-query';
import type { Resource, SequenceComponentMetadata } from '@/features/resources/hooks/useResources.ts';
import {
  createVideoEditorSequenceComponentCatalog,
  type VideoEditorSequenceComponentCatalog,
} from '@/tools/video-editor/lib/sequence-component-catalog.ts';
import { useOptionalSequenceComponentCatalog } from '@/tools/video-editor/runtime/catalogContexts.tsx';

export { SequenceComponentCatalogProvider } from '@/tools/video-editor/runtime/catalogContexts.tsx';

export type {
  CreateVideoEditorSequenceComponentInput,
  DeleteVideoEditorSequenceComponentInput,
  SequenceComponentResource,
  UpdateVideoEditorSequenceComponentInput,
  VideoEditorSequenceComponentCatalog,
  VideoEditorSequenceComponentCatalogOptions,
} from '@/tools/video-editor/lib/sequence-component-catalog.ts';

export { createVideoEditorSequenceComponentCatalog } from '@/tools/video-editor/lib/sequence-component-catalog.ts';

/** Fallback catalog when no Runtime catalog is injected: no components. */
function useEmptySequenceComponentCatalog(): VideoEditorSequenceComponentCatalog {
  return useMemo(() => createVideoEditorSequenceComponentCatalog(), []);
}

export function useResolvedSequenceComponentCatalog(
  injectedCatalog?: VideoEditorSequenceComponentCatalog | null,
): VideoEditorSequenceComponentCatalog {
  const fallbackCatalog = useEmptySequenceComponentCatalog();
  const selected=injectedCatalog??fallbackCatalog;
  return useMemo(()=>({...selected,canCreateComponent:false,canUpdateComponent:false,createComponent:undefined,updateComponent:undefined}),[selected]);
}

export function useSequenceResources() {
  const injectedCatalog = useOptionalSequenceComponentCatalog();
  const fallbackCatalog = useEmptySequenceComponentCatalog();
  const selected=injectedCatalog??fallbackCatalog;
  return useMemo(()=>({...selected,canCreateComponent:false,canUpdateComponent:false,createComponent:undefined,updateComponent:undefined}),[selected]);
}

type CreateVars = { metadata: SequenceComponentMetadata };
type UpdateVars = { id: string; metadata: SequenceComponentMetadata };

export function useCreateSequenceComponentResource(): Omit<
  UseMutationResult<Resource, Error, CreateVars, unknown>,
  'mutate' | 'mutateAsync'
> & {
  mutate: UseMutationResult<Resource, Error, CreateVars, unknown>['mutate'];
  mutateAsync: (
    variables: CreateVars,
    options?: UseMutationOptions<Resource, Error, CreateVars, unknown>,
  ) => Promise<Resource>;
} {
  const mutation=useMutation<Resource,Error,CreateVars>({mutationFn:async()=>{
    throw new Error('Custom element code must be authored and admitted through project pack files. Embedded resource source creation/update is unsupported.');
  }});
  return mutation as unknown as ReturnType<typeof useCreateSequenceComponentResource>;
}

export function useUpdateSequenceComponentResource(): Omit<
  UseMutationResult<Resource, Error, UpdateVars, unknown>,
  'mutate' | 'mutateAsync'
> & {
  mutate: UseMutationResult<Resource, Error, UpdateVars, unknown>['mutate'];
  mutateAsync: (
    variables: UpdateVars,
    options?: UseMutationOptions<Resource, Error, UpdateVars, unknown>,
  ) => Promise<Resource>;
} {
  const mutation=useMutation<Resource,Error,UpdateVars>({mutationFn:async()=>{
    throw new Error('Custom element code must be authored and admitted through project pack files. Embedded resource source creation/update is unsupported.');
  }});
  return mutation as unknown as ReturnType<typeof useUpdateSequenceComponentResource>;
}
