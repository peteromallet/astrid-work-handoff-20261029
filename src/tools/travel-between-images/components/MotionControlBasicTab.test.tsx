import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionControlBasicTab } from './MotionControlBasicTab';
import * as settingsModule from '../settings';

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/shared/components/ui/switch', () => ({
  Switch: ({
    id,
    checked,
    onCheckedChange,
  }: {
    id?: string;
    checked?: boolean;
    onCheckedChange?: (value: boolean) => void;
  }) => (
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
}));

vi.mock('@/shared/components/ui/primitives/label', () => ({
  Label: ({
    children,
    htmlFor,
    className,
  }: {
    children: React.ReactNode;
    htmlFor?: string;
    className?: string;
  }) => (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
  ),
}));

vi.mock('@/shared/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/shared/components/media/HoverScrubVideo', () => ({
  HoverScrubVideo: ({ src }: { src: string }) => <div data-testid="hover-scrub-video">{src}</div>,
}));

vi.mock('@/domains/lora/components', () => ({
  ActiveLoRAsDisplay: ({
    selectedLoras,
    onAddTriggerWord,
    renderHeaderActions,
  }: {
    selectedLoras: Array<{ id: string }>;
    onAddTriggerWord?: (trigger: string) => void;
    renderHeaderActions?: () => React.ReactNode;
  }) => (
    <div data-testid="active-loras-display">
      <span>{selectedLoras.length}</span>
      <button type="button" onClick={() => onAddTriggerWord?.('trigger-word')}>
        add-trigger-word
      </button>
      {renderHeaderActions?.()}
    </div>
  ),
}));

vi.mock('@/shared/components/MotionPresetSelector/MotionPresetSectionHeader', () => ({
  MotionPresetSectionHeader: () => <span>motion-preset-header</span>,
}));

describe('MotionControlBasicTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function buildProps(
    overrides: Partial<React.ComponentProps<typeof MotionControlBasicTab>> = {},
  ) {
    return {
      generationTypeMode: 'vace',
      guidanceKind: undefined,
      hasStructureVideo: false,
      smoothContinuations: true,
      onSmoothContinuationsChange: vi.fn(),
      allPresets: [
        {
          id: '__builtin_default_vace__',
          metadata: {
            name: 'Basic',
            description: 'Default preset',
            phaseConfig: { num_phases: 3 },
          },
        },
        {
          id: 'preset-2',
          metadata: {
            name: 'Orbit',
            description: 'Orbit preset',
            phaseConfig: { num_phases: 3 },
            sample_generations: [{ type: 'video', url: 'orbit.mp4' }],
          },
        },
      ] as never[],
      isCustomConfig: false,
      selectedPhasePresetId: 'preset-2',
      builtinDefaultId: '__builtin_default_vace__',
      onPresetSelect: vi.fn(),
      onCustomClick: vi.fn(),
      selectedLoras: [{ id: 'lora-1', path: '/lora', strength: 0.6 }] as never[],
      onRemoveLora: vi.fn(),
      onLoraStrengthChange: vi.fn(),
      onAddTriggerWord: vi.fn(),
      renderLoraHeaderActions: () => <span>header-actions</span>,
      ...overrides,
    } satisfies React.ComponentProps<typeof MotionControlBasicTab>;
  }

  it('renders presets, smooth continuations, and lora controls ', () => {
    const onPresetSelect = vi.fn();
    const onCustomClick = vi.fn();
    const onSmoothContinuationsChange = vi.fn();
    const onAddTriggerWord = vi.fn();

    render(
      <MotionControlBasicTab
        {...buildProps({
          onPresetSelect,
          onCustomClick,
          onSmoothContinuationsChange,
          onAddTriggerWord,
        })}
      />,
    );

    expect(screen.getByText('motion-preset-header')).toBeInTheDocument();
    expect(screen.getByText('Basic')).toBeInTheDocument();
    expect(screen.getByText('Orbit')).toBeInTheDocument();
    expect(screen.getByText('(default)')).toBeInTheDocument();
    expect(screen.getByTestId('hover-scrub-video')).toHaveTextContent('orbit.mp4');
    expect(screen.getByLabelText('Smooth Continuations')).toBeChecked();
    expect(screen.getByTestId('active-loras-display')).toHaveTextContent('1');
    expect(screen.getByText('header-actions')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Orbit/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.click(screen.getByRole('button', { name: 'add-trigger-word' }));
    fireEvent.click(screen.getByLabelText('Smooth Continuations'));

    expect(onPresetSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'preset-2' }),
    );
    expect(onCustomClick).toHaveBeenCalledTimes(1);
    expect(onAddTriggerWord).toHaveBeenCalledWith('trigger-word');
    expect(onSmoothContinuationsChange).toHaveBeenCalledWith(false);
  });

  it('forwards guidanceKind and structure-video state into policy resolution', () => {
    const resolveGenerationPolicySpy = vi.spyOn(settingsModule, 'resolveGenerationPolicy');

    render(
      <MotionControlBasicTab
        {...buildProps({
          guidanceKind: 'flow',
          hasStructureVideo: true,
        })}
      />,
    );

    expect(resolveGenerationPolicySpy).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        smoothContinuations: true,
        requestedExecutionMode: 'vace',
        guidanceKind: 'flow',
        hasStructureVideo: true,
      }),
    );
  });
});
