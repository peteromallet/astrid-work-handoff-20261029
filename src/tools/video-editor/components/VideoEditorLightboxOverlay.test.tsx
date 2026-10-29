import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VideoEditorLightboxOverlay } from './VideoEditorLightboxOverlay';

describe('VideoEditorLightboxOverlay', () => {
  it('renders at the top-center lightbox layer without intercepting pointer input', () => {
    const { container } = render(
      <VideoEditorLightboxOverlay
        indicator={{
          shotGroupLabel: 'Intro',
          shotGroupColor: '#22c55e',
          positionInGroup: { current: 2, total: 5 },
          positionInList: { current: 3, total: 12 },
        }}
      />,
    );

    expect(screen.getByText('Intro')).toBeInTheDocument();
    expect(screen.getByText('2 of 5')).toBeInTheDocument();
    expect(screen.getByText('3 of 12')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass(
      'pointer-events-none',
      'fixed',
      'left-1/2',
      'top-4',
      'z-[100001]',
      '-translate-x-1/2',
    );
  });
});
