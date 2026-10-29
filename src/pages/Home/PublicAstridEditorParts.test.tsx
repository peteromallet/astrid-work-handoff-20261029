import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createVideoEditorEffectCatalog,
  EffectCatalogProvider,
} from '@/tools/video-editor/hooks/useEffectResources.ts';
import { PublicAstridInspector } from './PublicAstridEditorParts.tsx';

const mocks = vi.hoisted(() => ({
  onEffectResources: vi.fn(),
}));

vi.mock('@/features/resources/hooks/useResources.ts', () => {
  const emptyQuery = () => ({
    data: [],
    error: null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  });
  const mutation = () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  });
  return {
    useCreateResource: mutation,
    useDeleteResource: mutation,
    useListPublicResources: emptyQuery,
    useListResources: emptyQuery,
    useUpdateResource: mutation,
  };
});

vi.mock('@/tools/video-editor/components/PropertiesPanel/PropertiesPanelBody.tsx', () => ({
  PropertiesPanelBody: ({ effectResources }: { effectResources: unknown }) => {
    mocks.onEffectResources(effectResources);
    return <div data-testid="public-properties-body" />;
  },
}));

vi.mock('./publicAstridExample.tsx', () => ({
  usePublicAstridExample: () => ({ silentVideoWaveformAssetHashes: {} }),
}));

function renderInspector(effectCatalog: ReturnType<typeof createVideoEditorEffectCatalog>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <EffectCatalogProvider value={effectCatalog}>
        <PublicAstridInspector />
      </EffectCatalogProvider>
    </QueryClientProvider>,
  );
}

describe('PublicAstridInspector', () => {
  beforeEach(() => {
    mocks.onEffectResources.mockReset();
  });

  it('reads the effect catalog supplied by the public editor host', async () => {
    const effectCatalog = createVideoEditorEffectCatalog();

    renderInspector(effectCatalog);

    await waitFor(() => expect(mocks.onEffectResources).toHaveBeenCalledWith(effectCatalog));
    expect(screen.getByTestId('public-properties-body')).toBeInTheDocument();
  });
});
