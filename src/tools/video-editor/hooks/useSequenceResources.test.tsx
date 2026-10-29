import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import {
  SequenceComponentCatalogProvider,
  createVideoEditorSequenceComponentCatalog,
  useResolvedSequenceComponentCatalog,
  useSequenceResources,
} from './useSequenceResources';

describe('useSequenceResources', () => {
  it('falls back to an empty catalog, with no backend query, when nothing is injected', () => {
    const { result } = renderHook(() => useSequenceResources());

    expect(result.current.components).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.canCreateComponent).toBe(false);
  });

  it('prefers the injected catalog from context and strips its writers', () => {
    const injected = createVideoEditorSequenceComponentCatalog({
      components: [{
        id: 'component-1',
        type: 'sequence-component',
        name: 'Title',
        slug: 'title',
        clipType: 'sequence:title',
        code: 'export default () => null',
        created_by: { is_you: true },
        is_public: false,
      } as never],
      createComponent: async () => ({ id: 'created' }),
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SequenceComponentCatalogProvider value={injected}>{children}</SequenceComponentCatalogProvider>
    );

    const { result } = renderHook(() => useSequenceResources(), { wrapper });

    expect(result.current.components.map((component) => component.id)).toEqual(['component-1']);
    expect(result.current.canCreateComponent).toBe(false);
    expect(result.current.createComponent).toBeUndefined();
  });

  it('resolves an explicitly injected catalog without a provider', () => {
    const injected = createVideoEditorSequenceComponentCatalog();

    const { result } = renderHook(() => useResolvedSequenceComponentCatalog(injected));

    expect(result.current.components).toEqual([]);
    expect(result.current.canUpdateComponent).toBe(false);
  });
});
