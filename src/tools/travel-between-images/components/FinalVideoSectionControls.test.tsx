import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinalVideoSectionControls } from './FinalVideoSectionControls';

vi.mock('date-fns', () => ({
  formatDistanceToNow: () => '2 hours ago',
}));

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/shared/components/ui/select', async () => {
  const React = await import('react');
  const SelectContext = React.createContext<(value: string) => void>(() => {});

  return {
    Select: ({
      children,
      onValueChange,
    }: {
      children: React.ReactNode;
      onValueChange?: (value: string) => void;
    }) => (
      <SelectContext.Provider value={onValueChange ?? (() => {})}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({
      children,
      value,
    }: {
      children: React.ReactNode;
      value: string;
    }) => {
      const handleSelect = React.useContext(SelectContext);

      return (
        <button
          type="button"
          data-testid={`select-item-${value}`}
          onClick={() => handleSelect(value)}
        >
          {children}
        </button>
      );
    },
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
    SelectValue: ({
      children,
      placeholder,
    }: {
      children?: React.ReactNode;
      placeholder?: string;
    }) => <span>{children ?? placeholder}</span>,
  };
});

vi.mock('@/shared/components/VariantBadge', () => ({
  VariantBadge: ({
    derivedCount,
    unviewedVariantCount,
    hasUnviewedVariants,
    onMarkAllViewed,
  }: {
    derivedCount: number;
    unviewedVariantCount: number;
    hasUnviewedVariants: boolean;
    onMarkAllViewed: () => void;
  }) => (
    <button type="button" onClick={onMarkAllViewed}>
      Badge {derivedCount}/{unviewedVariantCount}/{String(hasUnviewedVariants)}
    </button>
  ),
}));

describe('FinalVideoSectionControls', () => {
  const parentGenerations = [
    { id: 'parent-1', created_at: '2026-03-11T10:00:00Z', location: 'video-1.mp4' },
    { id: 'parent-2', created_at: '2026-03-11T12:00:00Z', location: null },
  ] as never[];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function buildProps(
    overrides: Partial<React.ComponentProps<typeof FinalVideoSectionControls>> = {},
  ) {
    return {
      readOnly: false,
      hasFinalOutput: true,
      badgeData: {
        derivedCount: 3,
        unviewedVariantCount: 1,
        hasUnviewedVariants: true,
      },
      onMarkAllVariantsViewed: vi.fn(),
      selectedParentId: 'parent-1',
      progress: { completed: 2, total: 2 },
      onJoinSegmentsClick: vi.fn(),
      parentGenerations,
      selectedIndex: 0,
      onOutputSelect: vi.fn(),
      ...overrides,
    } satisfies React.ComponentProps<typeof FinalVideoSectionControls>;
  }

  it('renders badge and join actions, and switches selected output', () => {
    const onJoinSegmentsClick = vi.fn();
    const onMarkAllVariantsViewed = vi.fn();
    const onOutputSelect = vi.fn();

    render(
      <FinalVideoSectionControls
        {...buildProps({
          onJoinSegmentsClick,
          onMarkAllVariantsViewed,
          onOutputSelect,
        })}
      />,
    );

    expect(screen.getByText('Final Video')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Badge 3/1/true' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join clips' })).toBeInTheDocument();
    expect(screen.getByText('Output 1 of 2')).toBeInTheDocument();
    expect(screen.getAllByText('2 hours ago')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Badge 3/1/true' }));
    fireEvent.click(screen.getByRole('button', { name: 'Join clips' }));
    fireEvent.click(screen.getByTestId('select-item-parent-2'));

    expect(onMarkAllVariantsViewed).toHaveBeenCalledTimes(1);
    expect(onJoinSegmentsClick).toHaveBeenCalledTimes(1);
    expect(onOutputSelect).toHaveBeenCalledWith('parent-2');
  });

  it('hides output selection and write controls in read-only mode', () => {
    const { rerender } = render(
      <FinalVideoSectionControls
        {...buildProps({
          parentGenerations: [{ id: 'parent-1' }] as never[],
        })}
      />,
    );

    expect(screen.getByText('Final Video')).toBeInTheDocument();
    expect(screen.queryByText(/Output 1 of/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join clips' })).toBeInTheDocument();

    rerender(
      <FinalVideoSectionControls
        {...buildProps({
          readOnly: true,
          parentGenerations: [{ id: 'parent-1' }] as never[],
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Join clips' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Output 1 of/i)).not.toBeInTheDocument();
  });
});
