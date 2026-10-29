import { useSyncExternalStore } from 'react';
import { getAdmittedElementSelection, subscribeAdmittedElements } from '../../runtime/admitted-elements';
import { CodePathParamEditor } from '@/tools/video-editor/components/SequenceCreator/CodePathParamEditor.tsx';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import type { ClipPanelProps } from './ClipPanelBody.tsx';
import { resolveAstridElementParamDescriptor } from './astrid-element-param-descriptor.ts';

/** Editable host-provided parameters for the exact pinned Astrid element revision. */
export function AstridElementParams({
  clip,
  readOnly,
  registry,
  onChange,
}: Pick<ClipPanelProps, 'clip' | 'readOnly' | 'registry' | 'onChange'>) {
  useSyncExternalStore(subscribeAdmittedElements, getAdmittedElementSelection, getAdmittedElementSelection);
  const runtime = useVideoEditorRuntime();
  const descriptors = runtime.astridElementHost?.descriptors ?? [];
  const descriptor = resolveAstridElementParamDescriptor(
    clip,
    descriptors,
    readOnly,
    runtime.timelineEditability,
  );
  if (!clip || !descriptor) return null;

  const params = { ...(clip.params ?? {}) };
  const saveParams = (nextParams: Record<string, unknown>) => {
    if (readOnly) return;
    const currentDescriptor = resolveAstridElementParamDescriptor(
      clip,
      runtime.astridElementHost?.descriptors ?? [],
      readOnly,
      runtime.timelineEditability,
    );
    if (!currentDescriptor
      || currentDescriptor.id !== descriptor.id
      || currentDescriptor.kind !== descriptor.kind
      || currentDescriptor.packId !== descriptor.packId
      || currentDescriptor.revision !== descriptor.revision) return;
    onChange({ params: { ...params, ...nextParams } });
  };

  const schemaTitle = (descriptor.schema as { title?: unknown }).title;
  const label = typeof schemaTitle === 'string' && schemaTitle.length > 0
    ? schemaTitle
    : descriptor.id;

  return (
    <section
      className="mt-3 space-y-2 rounded-xl border border-border bg-card/70 p-3"
      data-testid="astrid-element-params"
    >
      <div>
        <h3 className="text-sm font-medium text-foreground">{label} parameters</h3>
        <p className="text-xs text-muted-foreground">Values save with this pinned element revision.</p>
      </div>
      <CodePathParamEditor
        schemaJson={descriptor.schema}
        values={params}
        allowedAssetKeys={Object.keys(registry)}
        onChange={saveParams}
      />
    </section>
  );
}

export type { AstridElementParamDescriptor } from './astrid-element-param-descriptor.ts';
