// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GeneratedImageWithMetadata } from '../../MediaGallery/types';
import { ActionButtons } from './ActionButtons';

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

describe('MediaGallery item actions', () => {
  it('does not expose an edit-image lightbox entry', () => {
    render(
      <ActionButtons
        image={{ id: 'image-1' } as GeneratedImageWithMetadata}
        localStarred={false}
        isTogglingStar={false}
        isDeleting={false}
        showStar
        showDelete
        onToggleStar={vi.fn()}
        setIsTogglingStar={vi.fn()}
        setLocalStarred={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.queryByTitle('Edit image')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
