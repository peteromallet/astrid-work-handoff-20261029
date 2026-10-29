// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Header } from './Header';
import type { Shot } from '@/domains/generation/types';

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ComponentProps<'button'>) => <button {...props}>{children}</button>,
}));

vi.mock('@/shared/components/ui/input', () => ({
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
}));

function createSelectedShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: 'shot-1',
    name: 'Shot 1',
    ...overrides,
  } as Shot;
}

function renderHeader(overrides: Partial<React.ComponentProps<typeof Header>> = {}) {
  const props: React.ComponentProps<typeof Header> = {
    selectedShot: createSelectedShot(),
    isEditingName: false,
    editingName: 'Shot 1',
    onBack: vi.fn(),
    onUpdateShotName: vi.fn(),
    onPreviousShot: vi.fn(),
    onNextShot: vi.fn(),
    hasPrevious: true,
    hasNext: true,
    onNameClick: vi.fn(),
    onNameSave: vi.fn(),
    onNameCancel: vi.fn(),
    onNameKeyDown: vi.fn(),
    onEditingNameChange: vi.fn(),
    centerSectionRef: { current: null },
    isSticky: false,
    ...overrides,
  };

  return {
    ...render(<Header {...props} />),
    props,
  };
}

describe('Header', () => {
  it('shows the shot name and offers no aspect-ratio controls', () => {
    renderHeader();

    expect(screen.getAllByText('Shot 1').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('aspect-ratio-selector')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revert to project dimensions' })).not.toBeInTheDocument();
  });

  it('calls onBack from the back button', () => {
    const { props } = renderHeader();

    fireEvent.click(screen.getAllByTitle('Back to shots')[0]);

    expect(props.onBack).toHaveBeenCalledTimes(1);
  });
});
