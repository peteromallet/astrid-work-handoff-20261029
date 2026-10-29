import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EditVideoPage from './EditVideoPage';

vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProjectSelectionContext: () => ({ selectedProjectId: 'project-1' }),
  useProjectCrudContext: () => ({ projects: [{ id: 'project-1', aspectRatio: '16:9' }] }),
}));

vi.mock('@/shared/hooks/media/useEditToolMediaPersistence', () => ({
  useEditToolMediaPersistence: () => ({
    selectedMedia: null,
    setSelectedMedia: vi.fn(),
    handleEditorClose: vi.fn(),
    showSkeleton: false,
    updateUISettings: vi.fn(),
    isUISettingsLoading: false,
  }),
}));

vi.mock('@/shared/hooks/mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/shared/components/MediaSelectionPanel', () => ({ MediaSelectionPanel: () => <div /> }));
vi.mock('../components/InlineEditVideoView', () => ({ InlineEditVideoView: () => <div /> }));
vi.mock('@/domains/generation/navigation', () => ({ navigateToGenerationById: vi.fn() }));
vi.mock('@/shared/components/ui/runtime/sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({ normalizeAndPresentError: vi.fn() }));

describe('EditVideoPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows no online-account line before a video is uploaded', () => {
    render(<EditVideoPage />);
    expect(screen.queryByTestId('cloud-backend-notice')).toBeNull();
  });

  it('shows the online-account line when a video is uploaded, and sends no request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { container } = render(<EditVideoPage />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('cloud-backend-notice').textContent).toBe(
        "Edit Videos needs an online account, which isn't available yet.",
      );
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
