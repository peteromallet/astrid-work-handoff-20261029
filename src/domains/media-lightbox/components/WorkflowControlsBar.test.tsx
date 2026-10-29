// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowControlsBar } from './WorkflowControlsBar';

describe('WorkflowControlsBar', () => {
  it('ignores legacy apply settings props while retaining timeline actions', () => {
    const onAddToVideoEditor = vi.fn();
    const legacyCore = {
      isVideo: false,
      onAddToVideoEditor,
      addToVideoEditorPhase: 'idle' as const,
      onApplySettings: vi.fn(),
      handleApplySettings: vi.fn(),
      onDelete: vi.fn(),
      isSpecialEditMode: false,
    };

    render(
      <WorkflowControlsBar
        core={legacyCore}
      />,
    );

    expect(screen.queryByRole('button', { name: /apply settings/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add to video editor timeline' }));
    expect(onAddToVideoEditor).toHaveBeenCalledTimes(1);
  });
});
