import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PromptEditorPromptList } from './PromptEditorPromptList';

const mocks = vi.hoisted(() => ({
  PromptInputRow: vi.fn(({ promptEntry }: { promptEntry: { id: string } }) => (
    <div data-testid={`prompt-row-${promptEntry.id}`} />
  )),
}));

vi.mock('@/shared/components/ImageGenerationForm', () => ({
  PromptInputRow: (props: unknown) => mocks.PromptInputRow(props),
}));

vi.mock('@/shared/components/ImageGenerationForm/components/PromptInputRow', () => ({
  PromptInputRow: (props: unknown) => mocks.PromptInputRow(props),
}));

describe('PromptEditorPromptList', () => {
  it('renders empty-state copy when there are no prompts', () => {
    render(
      <PromptEditorPromptList
        prompts={[]}
        isMobile={false}
        activePromptIdForFullView={null}
        onActivePromptChange={vi.fn()}
        onUpdatePromptField={vi.fn()}
        onRemovePrompt={vi.fn()}
      />,
    );

    expect(screen.getByText('No prompts yet. Add one to get started.')).toBeInTheDocument();
    expect(mocks.PromptInputRow).not.toHaveBeenCalled();
  });

  it('renders prompt rows and wires row callbacks/flags', () => {
    const onUpdatePromptField = vi.fn();
    const onRemovePrompt = vi.fn();
    const onActivePromptChange = vi.fn();

    render(
      <PromptEditorPromptList
        prompts={[
          { id: 'p1', fullPrompt: 'A', shortPrompt: 'A short' },
          { id: 'p2', fullPrompt: 'B', shortPrompt: 'B short' },
        ]}
        isMobile={true}
        activePromptIdForFullView={'p2'}
        onActivePromptChange={onActivePromptChange}
        onUpdatePromptField={onUpdatePromptField}
        onRemovePrompt={onRemovePrompt}
      />,
    );

    expect(screen.getByTestId('prompt-row-p1')).toBeInTheDocument();
    expect(screen.getByTestId('prompt-row-p2')).toBeInTheDocument();
    expect(mocks.PromptInputRow).toHaveBeenCalledTimes(2);

    const firstCallProps = mocks.PromptInputRow.mock.calls[0][0];
    const secondCallProps = mocks.PromptInputRow.mock.calls[1][0];
    expect(firstCallProps).toEqual(
      expect.objectContaining({
        totalPrompts: 2,
        canRemove: true,
        autoEnterEditWhenActive: true,
      }),
    );
    expect(secondCallProps).toEqual(
      expect.objectContaining({
        isActiveForFullView: true,
        onUpdate: onUpdatePromptField,
        onSetActiveForFullView: onActivePromptChange,
      }),
    );
  });
});
