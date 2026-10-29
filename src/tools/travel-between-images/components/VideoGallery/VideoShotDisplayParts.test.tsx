// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { GenerationRow } from '@/domains/generation/types';
import {
  ShotControls,
  ShotMetadata,
  ShotPreview,
} from './VideoShotDisplayParts';

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({
    children,
    type,
    ...props
  }: {
    children: ReactNode;
    type?: 'button' | 'submit' | 'reset';
    [key: string]: unknown;
  }) => (
    <button type={type ?? 'button'} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/shared/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <div data-tooltip="true">{children}</div>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/shared/lib/media/mediaUrl', () => ({
  getDisplayUrl: (url: string) => `display:${url}`,
}));

vi.mock('@/shared/components/ui/contracts/cn', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
}));

function createImage(id: string, url: string): GenerationRow {
  return {
    id,
    imageUrl: url,
    location: url,
    thumbUrl: url,
  } as GenerationRow;
}

function getTooltipButton(label: RegExp | string): HTMLButtonElement {
  const tooltipText = typeof label === 'string'
    ? screen.getByText(label)
    : screen.getByText(label);

  return within(tooltipText.closest('[data-tooltip="true"]') as HTMLElement).getByRole('button');
}

describe('VideoShotDisplayParts', () => {
  it('renders the shot name with its generation mode label', () => {
    const { rerender } = render(<ShotMetadata displayName="Shot Alpha" generationMode="by-pair" />);

    expect(screen.getByRole('heading', { name: 'Shot Alpha' })).toBeInTheDocument();
    expect(screen.getByText('pair')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    rerender(<ShotMetadata displayName="Shot Alpha" generationMode="timeline" />);

    expect(screen.getByText('timeline')).toBeInTheDocument();
  });

  it('forwards the generate-video callback when the shot is actionable and disables controls while saving', () => {
    const callbacks = {
      onVideoClick: vi.fn(),
      onToggleHidden: vi.fn(),
    };

    const { rerender } = render(
      <ShotControls
        isTempShot={false}
        displayImagesCount={2}
        isHidden={false}
        {...callbacks}
      />,
    );

    fireEvent.click(getTooltipButton(/generate video/i));

    expect(callbacks.onVideoClick).toHaveBeenCalledTimes(1);

    rerender(
      <ShotControls
        isTempShot={true}
        displayImagesCount={2}
        isHidden={false}
        {...callbacks}
      />,
    );

    expect(screen.getAllByText('Saving...').length).toBeGreaterThan(0);
    screen.getAllByRole('button').forEach((button) => {
      expect(button).toBeDisabled();
    });
  });

  it('offers no rename, duplicate or delete controls on a shot card', () => {
    render(
      <ShotControls
        isTempShot={false}
        displayImagesCount={2}
        isHidden={true}
        onVideoClick={vi.fn()}
        onToggleHidden={vi.fn()}
      />,
    );

    expect(screen.queryByText(/edit shot name/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplicate shot' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplicate with videos' })).not.toBeInTheDocument();
    expect(screen.queryByText(/delete shot/i)).not.toBeInTheDocument();
  });

  it('renders a hide toggle that does not bubble to the card', () => {
    const callbacks = {
      onVideoClick: vi.fn(),
      onToggleHidden: vi.fn(),
    };
    const parentClick = vi.fn();

    const { rerender } = render(
      <div onClick={parentClick}>
        <ShotControls
          isTempShot={false}
          displayImagesCount={2}
          isHidden={false}
          {...callbacks}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: /hide shot/i }));

    expect(callbacks.onToggleHidden).toHaveBeenCalledTimes(1);
    expect(parentClick).not.toHaveBeenCalled();
    expect(screen.getByText('Hide shot')).toBeInTheDocument();

    rerender(
      <div onClick={parentClick}>
        <ShotControls
          isTempShot={false}
          displayImagesCount={2}
          isHidden={true}
          {...callbacks}
        />
      </div>,
    );

    expect(screen.getByLabelText('Unhide shot')).toBeInTheDocument();
    expect(screen.getByText('Unhide shot')).toBeInTheDocument();
  });

  it('shows collapsed images, expands them, and surfaces the select action', () => {
    const onSelectShotForAddition = vi.fn();

    render(
      <ShotPreview
        displayImages={[
          createImage('img-1', '/one.png'),
          createImage('img-2', '/two.png'),
          createImage('img-3', '/three.png'),
          createImage('img-4', '/four.png'),
        ]}
        pendingUploads={1}
        dropLoadingState="loading"
        showMobileSelect={true}
        isSelectedForAddition={false}
        onSelectShotForAddition={onSelectShotForAddition}
      />,
    );

    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(screen.getByText('Show All (5)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show all \(5\)/i }));

    expect(screen.getAllByRole('img')).toHaveLength(4);
    expect(screen.getByRole('button', { name: /hide/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /select/i }));

    expect(onSelectShotForAddition).toHaveBeenCalledTimes(1);
  });
});
