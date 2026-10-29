import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GenerationsPaneEmptyState } from './GenerationsPaneEmptyState';

describe('GenerationsPaneEmptyState', () => {
  it('renders the message', () => {
    render(<GenerationsPaneEmptyState message="Nothing starred" />);
    expect(screen.getByText('Nothing starred')).toBeInTheDocument();
  });

  it('shows no button when no handler is given', () => {
    render(<GenerationsPaneEmptyState message="Nothing starred" />);
    expect(screen.queryByRole('button', { name: 'Show everything' })).not.toBeInTheDocument();
  });

  it('shows a ghost "Show everything" button and calls the handler on click', () => {
    const onShowEverything = vi.fn();
    render(<GenerationsPaneEmptyState message="Nothing starred" onShowEverything={onShowEverything} />);
    const button = screen.getByRole('button', { name: 'Show everything' });
    fireEvent.click(button);
    expect(onShowEverything).toHaveBeenCalledTimes(1);
  });
});
