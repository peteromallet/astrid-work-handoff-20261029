// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorHeader } from './ShotImagesEditorHeader';

vi.mock('@/shared/components/ui/card', () => ({
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/shared/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/shared/components/ui/segmented-control', async () => {
  const React = await import('react');
  const SegmentContext = React.createContext<{
    onValueChange?: (value: string) => void;
    disabled?: boolean;
  }>({});

  return {
    SegmentedControl: ({
      children,
      onValueChange,
      disabled,
    }: {
      children: React.ReactNode;
      onValueChange?: (value: string) => void;
      disabled?: boolean;
    }) => (
      <SegmentContext.Provider value={{ onValueChange, disabled }}>
        <div>{children}</div>
      </SegmentContext.Provider>
    ),
    SegmentedControlItem: ({
      children,
      value,
    }: {
      children: React.ReactNode;
      value: string;
    }) => {
      const context = React.useContext(SegmentContext);

      return (
        <button
          type="button"
          disabled={context.disabled}
          onClick={() => context.onValueChange?.(value)}
        >
          {children}
        </button>
      );
    },
  };
});

describe('EditorHeader', () => {
  function buildProps(overrides: Partial<React.ComponentProps<typeof EditorHeader>> = {}) {
    return {
      settingsError: 'settings broke',
      readOnly: false,
      hasVideosToPreview: true,
      isDownloadingImages: false,
      hasImages: true,
      isMobile: false,
      generationMode: 'timeline',
      onGenerationModeChange: vi.fn(),
      onOpenPreview: vi.fn(),
      onDownloadAll: vi.fn(),
      ...overrides,
    } satisfies React.ComponentProps<typeof EditorHeader>;
  }

  it('renders preview, download, and desktop mode switching controls', () => {
    const onOpenPreview = vi.fn();
    const onDownloadAll = vi.fn();
    const onGenerationModeChange = vi.fn();

    render(
      <EditorHeader
        {...buildProps({
          onOpenPreview,
          onDownloadAll,
          onGenerationModeChange,
        })}
      />,
    );

    expect(screen.getByText('Guidance')).toBeInTheDocument();
    expect(screen.getByText('settings broke')).toBeInTheDocument();
    expect(screen.getByText('Preview all segments')).toBeInTheDocument();
    expect(screen.getByText('Download all images as zip')).toBeInTheDocument();

    const iconButtons = screen.getAllByRole('button').filter((button) => button.textContent === '');
    fireEvent.click(iconButtons[0]);
    fireEvent.click(iconButtons[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Batch' }));

    expect(onOpenPreview).toHaveBeenCalledTimes(1);
    expect(onDownloadAll).toHaveBeenCalledTimes(1);
    expect(onGenerationModeChange).toHaveBeenCalledWith('batch');
  });

  it('hides interactive controls when read-only or mobile', () => {
    render(
      <EditorHeader
        {...buildProps({
          readOnly: true,
          isMobile: true,
          hasVideosToPreview: false,
        })}
      />,
    );

    expect(screen.queryByText('Preview all segments')).not.toBeInTheDocument();
    expect(screen.queryByText('Download all images as zip')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Timeline' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Batch' })).not.toBeInTheDocument();
  });
});
