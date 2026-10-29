// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PanelCloseButton, PanelHeaderMeta } from './PanelHeaderControls';

describe('PanelHeaderControls', () => {
  it('renders id/pending metadata and handles copy action', () => {
    const onCopyId = vi.fn();
    render(
      <PanelHeaderMeta
        taskId="task-1"
        idCopied={false}
        onCopyId={onCopyId}
        hasVariants={false}
        variants={[]}
        pendingTaskCount={2}
        unviewedVariantCount={0}
        onMarkAllViewed={vi.fn()}
        variantsSectionRef={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'id' }));
    expect(onCopyId).toHaveBeenCalledTimes(1);
    expect(screen.getByText('2 pending')).toBeInTheDocument();
  });

  it('triggers close callback', () => {
    const onClose = vi.fn();
    render(<PanelCloseButton isMobile={false} onClose={onClose} />);

    const closeButton = screen.getByRole('button', { name: 'Close viewer' });
    expect(closeButton).toBeInTheDocument();
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
