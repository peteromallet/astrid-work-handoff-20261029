// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddToTimelineButton } from './AddToTimelineButton';

describe('AddToTimelineButton', () => {
  it('is hidden except on coarse pointers, where it shows only on the selected tile', () => {
    const { rerender } = render(
      <AddToTimelineButton generationId="gen-1" onAddToTimeline={vi.fn()} isSelected={false} />,
    );
    const button = screen.getByLabelText('Add to timeline');

    expect(button.className).toContain('hidden');
    expect(button.className).toContain('[@media(pointer:coarse)]:flex');
    expect(button.className).toContain('[@media(pointer:coarse)]:opacity-0');
    expect(button.className).not.toContain('group-hover:opacity-100');

    rerender(<AddToTimelineButton generationId="gen-1" onAddToTimeline={vi.fn()} isSelected />);
    expect(screen.getByLabelText('Add to timeline').className).toContain('[@media(pointer:coarse)]:opacity-100');
  });

  it('calls the handler with the generation id and stops the click from reaching the tile', () => {
    const onAddToTimeline = vi.fn();
    const onTileClick = vi.fn();
    render(
      <div onClick={onTileClick}>
        <AddToTimelineButton generationId="gen-7" onAddToTimeline={onAddToTimeline} isSelected={false} />
      </div>,
    );

    fireEvent.click(screen.getByLabelText('Add to timeline'));

    expect(onAddToTimeline).toHaveBeenCalledWith('gen-7');
    expect(onTileClick).not.toHaveBeenCalled();
  });

  it('is disabled with the reason as its tooltip when adding is refused', async () => {
    const onAddToTimeline = vi.fn();
    const reason = "This gallery's project is not the selected editor's project";
    render(
      <AddToTimelineButton
        generationId="gen-1"
        onAddToTimeline={onAddToTimeline}
        disabledReason={reason}
        isSelected={false}
      />,
    );

    const button = screen.getByLabelText('Add to timeline');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onAddToTimeline).not.toHaveBeenCalled();

    await userEvent.hover(button.parentElement as HTMLElement);
    expect(await screen.findByText(reason)).toBeInTheDocument();
  });
});
