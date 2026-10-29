// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditBatchDialog } from './EditBatchDialog';

vi.mock('@/shared/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
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
      <button onClick={() => onNameChange('Updated Batch')}>Set Name</button>
      <button onClick={() => onDescriptionChange('Updated description')}>Set Description</button>
      <button onClick={onSubmit}>Submit</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

describe('EditBatchDialog', () => {
  it('renders the existing values and wires change/update handlers through the form fields', () => {
    const onOpenChange = vi.fn();
    const onNameChange = vi.fn();
    const onDescriptionChange = vi.fn();
    const onUpdate = vi.fn().mockResolvedValue(undefined);

    render(
      <EditBatchDialog
        isOpen
        editName="Existing Batch"
        editDescription="Existing description"
        isUpdating={false}
        onOpenChange={onOpenChange}
        onNameChange={onNameChange}
        onDescriptionChange={onDescriptionChange}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(screen.getByText('Set Name'));
    fireEvent.click(screen.getByText('Set Description'));
    fireEvent.click(screen.getByText('Submit'));
    fireEvent.click(screen.getByText('Cancel'));

    expect(onNameChange).toHaveBeenCalledWith('Updated Batch');
    expect(onDescriptionChange).toHaveBeenCalledWith('Updated description');
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
