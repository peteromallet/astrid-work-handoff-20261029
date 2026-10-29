import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShotFilter } from './ShotFilter';

describe('ShotFilter', () => {
  const baseProps = {
    shots: [{ id: 'shot-1', name: 'Opening' }] as React.ComponentProps<typeof ShotFilter>['shots'],
    onShotChange: vi.fn(),
    excludePositioned: false,
    onExcludePositionedChange: vi.fn(),
  };

  it('shows "Not in a shot" in the trigger for the no-shot filter, not the raw value', () => {
    render(<ShotFilter {...baseProps} selectedShotId="no-shot" />);
    expect(screen.getByText('Not in a shot')).toBeInTheDocument();
    expect(screen.queryByText('no-shot')).not.toBeInTheDocument();
  });
});
