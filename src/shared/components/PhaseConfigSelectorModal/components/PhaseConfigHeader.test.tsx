import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PhaseConfigHeader } from './PhaseConfigHeader';

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/shared/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('PhaseConfigHeader', () => {
  it('renders title and the restore-defaults tooltip label', () => {
    render(<PhaseConfigHeader onRestoreDefaults={vi.fn()} />);

    expect(screen.getByText('Phase Configuration')).toBeInTheDocument();
    expect(screen.getByText('Restore Defaults')).toBeInTheDocument();
    expect(screen.queryByText('Load Preset')).not.toBeInTheDocument();
    expect(screen.queryByText('Save As Preset')).not.toBeInTheDocument();
    expect(screen.queryByText('Overwrite Preset')).not.toBeInTheDocument();
  });

  it('wires the only icon button to the restore callback', () => {
    const onRestoreDefaults = vi.fn();

    render(<PhaseConfigHeader onRestoreDefaults={onRestoreDefaults} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);

    fireEvent.click(buttons[0]);

    expect(onRestoreDefaults).toHaveBeenCalledTimes(1);
  });
});
