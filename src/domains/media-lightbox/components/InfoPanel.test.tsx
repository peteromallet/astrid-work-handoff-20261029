// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/types/tasks';

const mocks = vi.hoisted(() => ({
  core: { onClose: vi.fn(), readOnly: false, isMobile: false, isTabletOrLarger: true },
  variants: {
    variants: [{ id: 'variant-1', generation_id: 'gen-1' }],
    activeVariant: null,
    primaryVariant: null,
    isLoadingVariants: false,
    handleVariantSelect: vi.fn(),
    handleMakePrimary: vi.fn(),
    handleDeleteVariant: vi.fn(),
    promoteSuccess: false,
    isPromoting: false,
    handlePromoteToGeneration: vi.fn(),
    isMakingMainVariant: false,
    canMakeMainVariant: false,
    handleMakeMainVariant: vi.fn(),
    pendingTaskCount: 0,
    unviewedVariantCount: 0,
    onMarkAllViewed: vi.fn(),
    variantsSectionRef: { current: null },
  },
}));

vi.mock('../contexts/LightboxStateContext', () => ({
  useLightboxCoreSafe: () => mocks.core,
  useLightboxVariantsSafe: () => mocks.variants,
}));
vi.mock('@/shared/hooks/clipboard/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({ copied: false, handleCopy: vi.fn() }),
}));
vi.mock('@/features/resources/hooks/useResources', () => ({ usePublicLoras: () => ({ data: [] }) }));
vi.mock('@/shared/components/VariantSelector', () => ({
  VariantSelector: ({ variants }: { variants: Array<{ id: string }> }) => (
    <div data-testid="variants">{variants.map((variant) => <span key={variant.id}>{variant.id}</span>)}</div>
  ),
}));
vi.mock('@/domains/generation/components/GenerationDetails', () => ({
  GenerationDetails: ({ task }: { task: Task }) => <p>{String(task.params.prompt)}</p>,
}));

import { InfoPanel } from './InfoPanel';

describe('InfoPanel', () => {
  beforeEach(() => {
    mocks.core.onClose.mockClear();
  });

  it('keeps task prompt, detailed parameters, and variants visible without edit controls', () => {
    const task = {
      id: 'task-1',
      taskType: 'single_image',
      params: { prompt: 'A moonlit greenhouse', seed: 718 },
      status: 'Complete',
      createdAt: '2025-01-01T00:00:00Z',
      projectId: 'project-1',
    } as Task;

    render(
      <InfoPanel
        variant="desktop"
        taskId="task-1"
        taskPanel={{
          taskDetailsData: {
            task,
            isLoading: false,
            status: 'ok',
            error: null,
            inputImages: [],
            taskId: 'task-1',
            onApplySettingsFromTask: vi.fn(),
          },
        }}
      />,
    );

    expect(screen.getByText('A moonlit greenhouse')).toBeInTheDocument();
    expect(screen.getByTestId('variants')).toHaveTextContent('variant-1');
    expect(screen.queryByRole('button', { name: 'Info' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply Settings' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close viewer' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByText(/"seed": 718/)).toBeInTheDocument();
  });
});
