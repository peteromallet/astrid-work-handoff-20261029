import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  NewShotDropZoneCard,
  PendingSkeletonShotCard,
  ShotListErrorState,
  ShotListLoadingState,
} from './ShotListDisplayStates';

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

vi.mock('@/shared/components/ui/contracts/cn', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  Loader2: () => <span data-testid="icon-loader" />,
  Plus: () => <span data-testid="icon-plus" />,
  Upload: () => <span data-testid="icon-upload" />,
}));

describe('ShotListDisplayStates', () => {
  it('renders loading state skeleton cards', () => {
    const { container } = render(<ShotListLoadingState />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders error state and triggers create-shot callback', () => {
    const onCreateNewShot = vi.fn();
    render(<ShotListErrorState errorMessage="boom" onCreateNewShot={onCreateNewShot} />);

    expect(screen.getByText('Error loading shots: boom')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /new shot/i }));
    expect(onCreateNewShot).toHaveBeenCalledTimes(1);
  });

  it('renders new-shot drop zone interactions and pending skeleton summary', () => {
    const handlers = {
      onDragEnter: vi.fn(),
      onDragOver: vi.fn(),
      onDragLeave: vi.fn(),
      onDrop: vi.fn(),
      onClick: vi.fn(),
    };

    const { container } = render(
      <>
        <NewShotDropZoneCard
          isNewShotProcessing={false}
          isNewShotDropTarget={true}
          newShotDropType="file"
          onDragEnter={handlers.onDragEnter}
          onDragOver={handlers.onDragOver}
          onDragLeave={handlers.onDragLeave}
          onDrop={handlers.onDrop}
          onClick={handlers.onClick}
        />
        <PendingSkeletonShotCard pendingSkeletonShot={{ imageCount: 5 }} />
      </>,
    );

    expect(screen.getByText('Drop files to create new shot')).toBeInTheDocument();
    expect(screen.getByText('Show All (5)')).toBeInTheDocument();

    const dropZone = container.querySelector('.group.p-4.border-2.border-dashed') as HTMLElement;
    fireEvent.dragEnter(dropZone);
    fireEvent.dragOver(dropZone);
    fireEvent.dragLeave(dropZone);
    fireEvent.drop(dropZone);
    fireEvent.click(dropZone);

    expect(handlers.onDragEnter).toHaveBeenCalledTimes(1);
    expect(handlers.onDragOver).toHaveBeenCalledTimes(1);
    expect(handlers.onDragLeave).toHaveBeenCalledTimes(1);
    expect(handlers.onDrop).toHaveBeenCalledTimes(1);
    expect(handlers.onClick).toHaveBeenCalledTimes(1);
  });
});
