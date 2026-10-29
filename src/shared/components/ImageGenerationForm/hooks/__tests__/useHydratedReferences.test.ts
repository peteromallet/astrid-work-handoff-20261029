import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHydratedReferences } from '../useHydratedReferences';

describe('useHydratedReferences', () => {
  it('returns empty array when referencePointers is undefined', () => {
    const { result } = renderHook(() => useHydratedReferences(undefined));

    expect(result.current.hydratedReferences).toEqual([]);
  });

  it('returns empty array when referencePointers is empty', () => {
    const { result } = renderHook(() => useHydratedReferences([]));

    expect(result.current.hydratedReferences).toEqual([]);
  });

  it('hydrates references whose image data is inline on the pointer', () => {
    const pointers = [
      {
        id: 'ref-legacy',
        name: 'Legacy Ref',
        styleReferenceImage: 'https://example.com/legacy.jpg',
        styleReferenceImageOriginal: 'https://example.com/legacy-original.jpg',
        styleReferenceStrength: 0.8,
      },
    ];

    const { result } = renderHook(() => useHydratedReferences(pointers as unknown));

    expect(result.current.hydratedReferences).toHaveLength(1);
    expect(result.current.hydratedReferences[0]).toEqual(expect.objectContaining({
      id: 'ref-legacy',
      resourceId: '',
      name: 'Legacy Ref',
      styleReferenceImage: 'https://example.com/legacy.jpg',
      styleReferenceStrength: 0.8,
    }));
  });

  it('drops pointers that reference a resource, because no reference library resolves them', () => {
    const pointers = [
      {
        id: 'ref-missing',
        resourceId: 'resource-nonexistent',
        name: 'Missing',
      },
    ];

    const { result } = renderHook(() => useHydratedReferences(pointers as unknown));

    expect(result.current.hydratedReferences).toHaveLength(0);
  });
});
