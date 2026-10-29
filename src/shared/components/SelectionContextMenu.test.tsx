// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SelectionContextMenu } from './SelectionContextMenu';

const existingShots = [
  { id: 'shot-1', name: 'Shot 1' },
  { id: 'shot-2', name: 'Shot 2' },
] as never[];

describe('SelectionContextMenu', () => {
  it('renders into document.body and lists the shots that already contain the selection', () => {
    render(
      <SelectionContextMenu
        position={{ x: 24, y: 48 }}
        onClose={vi.fn()}
        onNavigateToShot={vi.fn()}
        onOpenGenerateVideo={vi.fn()}
        existingShots={existingShots}
      />,
    );

    expect(document.body).toContainElement(screen.getByText('Shot 1'));
    expect(screen.getByText('Shot 2')).toBeInTheDocument();
    expect(screen.getAllByTitle('Jump to shot')).toHaveLength(2);
    expect(screen.getAllByTitle('Generate Video')).toHaveLength(2);
  });

  it('offers no shot-creation actions', () => {
    render(
      <SelectionContextMenu
        position={{ x: 24, y: 48 }}
        onClose={vi.fn()}
        existingShots={existingShots}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Create Shot' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generate Video' })).not.toBeInTheDocument();
  });

  it('renders nothing when no existing shot contains the selection', () => {
    render(
      <SelectionContextMenu
        position={{ x: 24, y: 48 }}
        onClose={vi.fn()}
        existingShots={[]}
      />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('closes on escape and click-away', () => {
    const onClose = vi.fn();

    render(
      <div>
        <button type="button">outside</button>
        <SelectionContextMenu
          position={{ x: 24, y: 48 }}
          onClose={onClose}
          existingShots={existingShots}
        />
      </div>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('forwards the jump and generate actions for a shot and closes the menu', () => {
    const onClose = vi.fn();
    const onNavigateToShot = vi.fn();
    const onOpenGenerateVideo = vi.fn();

    render(
      <SelectionContextMenu
        position={{ x: 24, y: 48 }}
        onClose={onClose}
        onNavigateToShot={onNavigateToShot}
        onOpenGenerateVideo={onOpenGenerateVideo}
        existingShots={existingShots}
      />,
    );

    const shot2Row = screen.getByText('Shot 2').closest('div')!;
    fireEvent.click(shot2Row.querySelector('[title="Jump to shot"]')!);
    fireEvent.click(shot2Row.querySelector('[title="Generate Video"]')!);

    expect(onNavigateToShot).toHaveBeenCalledWith({ id: 'shot-2', name: 'Shot 2' });
    expect(onOpenGenerateVideo).toHaveBeenCalledWith({ id: 'shot-2', name: 'Shot 2' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('offers Add to timeline without any shot and calls the handler once, then closes', () => {
    const onClose = vi.fn();
    const onAddToTimeline = vi.fn();

    render(
      <SelectionContextMenu
        position={{ x: 24, y: 48 }}
        onClose={onClose}
        onAddToTimeline={onAddToTimeline}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add to timeline' }));

    expect(onAddToTimeline).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('omits the timeline item when no handler is given', () => {
    render(
      <SelectionContextMenu position={{ x: 24, y: 48 }} onClose={vi.fn()} existingShots={existingShots} />,
    );

    expect(screen.queryByRole('button', { name: 'Add to timeline' })).not.toBeInTheDocument();
  });

  it('disables the timeline item with the reason when adding is refused', () => {
    const onAddToTimeline = vi.fn();
    const reason = "This gallery's project is not the selected editor's project";

    render(
      <SelectionContextMenu
        position={{ x: 24, y: 48 }}
        onClose={vi.fn()}
        onAddToTimeline={onAddToTimeline}
        addToTimelineDisabledReason={reason}
      />,
    );

    const item = screen.getByRole('button', { name: 'Add to timeline' });
    expect(item).toBeDisabled();
    expect(item).toHaveAttribute('title', reason);
    fireEvent.click(item);
    expect(onAddToTimeline).not.toHaveBeenCalled();
  });
});
