// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateBatchDialog } from './CreateBatchDialog';

const normalizeAndPresentErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => normalizeAndPresentErrorMock(...args),
}));

vi.mock('./BatchDialogFormFields', () => ({
  BatchDialogFormFields: ({
    onNameChange,
    onDescriptionChange,
    onSubmit,
    onCancel,
  }: {
    onNameChange: (value: string) => void;
    onDescriptionChange: (value: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
  }) => (
    <div>
      <button onClick={() => onNameChange('  New Batch  ')}>Set Name</button>
      <button onClick={() => onDescriptionChange('  Description  ')}>Set Description</button>
      <button onClick={onSubmit}>Submit</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

describe('CreateBatchDialog', () => {
  beforeEach(() => {
    normalizeAndPresentErrorMock.mockReset();
  });

  it('creates a batch with trimmed values and closes the dialog on success', async () => {
    const onOpenChange = vi.fn();
    const onCreateBatch = vi.fn().mockResolvedValue('batch-1');

    render(
      <CreateBatchDialog
        isOpen
        onOpenChange={onOpenChange}
        onCreateBatch={onCreateBatch}
      />,
    );

    fireEvent.click(screen.getByText('Set Name'));
    fireEvent.click(screen.getByText('Set Description'));
    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(onCreateBatch).toHaveBeenCalledWith('New Batch', 'Description');
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('reports create failures through normalizeAndPresentError', async () => {
    const error = new Error('create failed');
    const onCreateBatch = vi.fn().mockRejectedValue(error);

    render(
      <CreateBatchDialog
        isOpen
        onOpenChange={vi.fn()}
        onCreateBatch={onCreateBatch}
      />,
    );

    fireEvent.click(screen.getByText('Set Name'));
    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(normalizeAndPresentErrorMock).toHaveBeenCalledWith(error, {
        context: 'BatchSelector',
        showToast: false,
      });
    });
  });
});
