import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CharacterAnimatePage from './CharacterAnimatePage';

vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProjectSelectionContext: () => ({ selectedProjectId: 'project-1' }),
  useProjectCrudContext: () => ({ projects: [{ id: 'project-1', aspectRatio: '16:9' }] }),
}));

vi.mock('@/shared/hooks/mobile', () => ({ useIsMobile: () => false }));

vi.mock('@/shared/hooks/projects/useProjectGenerations', () => ({
  useProjectGenerations: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));

vi.mock('@/tools/character-animate/hooks/useCharacterAnimateSettings', () => ({
  useCharacterAnimateSettings: () => ({
    settings: undefined,
    updateField: vi.fn(),
    updateFields: vi.fn(),
    status: 'ready',
  }),
}));

vi.mock('@/tools/character-animate/hooks/useCharacterAnimateGenerate', () => ({
  useCharacterAnimateGenerate: () => ({
    handleGenerate: vi.fn(),
    isGenerating: false,
    showSuccessState: false,
    videosViewJustEnabled: false,
    setVideosViewJustEnabled: vi.fn(),
  }),
}));

vi.mock('./components/ResultsGallery', () => ({ ResultsGallery: () => <div /> }));
vi.mock('@/shared/components/ui/runtime/sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({ normalizeAndPresentError: vi.fn() }));

const NOTICE = "Animate Characters needs an online account, which isn't available yet.";

// The handlers read the file through FileList.item(), which a plain array does not have.
function fileList(file: File) {
  return { 0: file, length: 1, item: (index: number) => (index === 0 ? file : null) };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CharacterAnimatePage />
    </QueryClientProvider>,
  );
}

describe('CharacterAnimatePage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows no online-account line before anything is uploaded', () => {
    renderPage();
    expect(screen.queryByTestId('cloud-backend-notice')).toBeNull();
  });

  it('shows the online-account line when a character image is uploaded, and sends no request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { container } = renderPage();
    const input = container.querySelector('input[type="file"][accept^="image/"]') as HTMLInputElement;
    const file = new File(['x'], 'character.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: fileList(file) } });

    await waitFor(() => {
      expect(screen.getByTestId('cloud-backend-notice').textContent).toBe(NOTICE);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the online-account line when a motion video is uploaded, and sends no request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { container } = renderPage();
    const input = container.querySelector('input[type="file"][accept^="video/"]') as HTMLInputElement;
    const file = new File(['x'], 'motion.mp4', { type: 'video/mp4' });
    fireEvent.change(input, { target: { files: fileList(file) } });

    await waitFor(() => {
      expect(screen.getByTestId('cloud-backend-notice').textContent).toBe(NOTICE);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
