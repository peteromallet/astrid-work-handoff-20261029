import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChunkLoadErrorBoundary, isChunkLoadError } from '../ChunkLoadErrorBoundary';

function BrokenLazyChunk(): never {
  throw new Error('Failed to fetch dynamically imported module');
}

describe('ChunkLoadErrorBoundary', () => {
  it('recognizes failed chunk imports', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('unrelated'))).toBe(false);
  });

  it('shows an explicit Reload action without reloading automatically', () => {
    const reload = vi.fn();
    const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('location', { reload });
    render(
      <ChunkLoadErrorBoundary>
        <BrokenLazyChunk />
      </ChunkLoadErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: 'Astrid was updated' })).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Reload' });
    expect(button).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(reload).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
    logError.mockRestore();
  });
});
