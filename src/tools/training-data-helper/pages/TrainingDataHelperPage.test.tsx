import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TrainingDataHelperPage from './TrainingDataHelperPage';

vi.mock('@/shared/components/transitions/PageFadeIn', () => ({
  PageFadeIn: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('TrainingDataHelperPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the online-account line and sends no request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    render(<TrainingDataHelperPage />);

    await waitFor(() => {
      expect(screen.getByTestId('cloud-backend-notice').textContent).toBe(
        "Training Data Helper needs an online account, which isn't available yet.",
      );
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
