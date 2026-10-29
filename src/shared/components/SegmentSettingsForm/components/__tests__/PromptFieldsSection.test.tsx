import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PromptFieldsSection } from '../PromptFieldsSection';

const mockDefaultableTextarea = vi.fn();

vi.mock('@/shared/components/DefaultableTextarea', () => ({
  DefaultableTextarea: (props: Record<string, unknown>) => {
    mockDefaultableTextarea(props);
    const label = props.label as string;
    return (
      <div data-testid={`textarea-${label.toLowerCase().replace(':', '')}`}>
        <button type="button" onClick={() => (props.onChange as (value: string) => void)(`${label}-changed`)}>{`change-${label}`}</button>
        <button type="button" onClick={() => (props.onClear as () => void)()}>{`clear-${label}`}</button>
        <button type="button" onClick={() => (props.onUseDefault as () => void)()}>{`use-default-${label}`}</button>
        <button
          type="button"
          onClick={() => {
            const fn = props.onSetAsDefault as ((value: string) => Promise<void>) | undefined;
            void fn?.(`${label}-defaulted`);
          }}
        >
          {`set-default-${label}`}
        </button>
      </div>
    );
  },
}));

function buildSettings(overrides: Record<string, unknown> = {}) {
  return {
    prompt: '',
    negativePrompt: '',
    motionMode: 'basic',
    amountOfMotion: 50,
    selectedPhasePresetId: null,
    loras: [],
    numFrames: 61,
    randomSeed: true,
    makePrimaryVariant: false,
    textBeforePrompts: 'before-value',
    textAfterPrompts: 'after-value',
    ...overrides,
  };
}

beforeEach(() => {
  mockDefaultableTextarea.mockReset();
});

describe('PromptFieldsSection', () => {
  it('returns null when no shot-default prompt wrappers are available', () => {
    const { container } = render(
      <PromptFieldsSection
        settings={buildSettings() as never}
        onChange={vi.fn()}
        handleSaveFieldAsDefault={vi.fn(async () => undefined) as never}
        savingField={null}
      />,
    );

    expect(container.firstChild).toBeNull();
    expect(mockDefaultableTextarea).not.toHaveBeenCalled();
  });

  it('renders before/after fields and wires change and default handlers', () => {
    const onChange = vi.fn();
    const handleSaveFieldAsDefault = vi.fn(async () => undefined);

    render(
      <PromptFieldsSection
        settings={buildSettings() as never}
        onChange={onChange}
        shotDefaults={{
          textBeforePrompts: 'default-before',
          textAfterPrompts: 'default-after',
        } as never}
        hasOverride={{ textBeforePrompts: true, textAfterPrompts: false } as never}
        onSaveFieldAsDefault={vi.fn() as never}
        handleSaveFieldAsDefault={handleSaveFieldAsDefault as never}
        savingField="textAfterPrompts"
      />,
    );

    expect(screen.getByTestId('textarea-before')).toBeInTheDocument();
    expect(screen.getByTestId('textarea-after')).toBeInTheDocument();
    expect(mockDefaultableTextarea).toHaveBeenCalledTimes(2);

    const beforeProps = mockDefaultableTextarea.mock.calls[0][0];
    expect(beforeProps.defaultValue).toBe('default-before');
    expect(beforeProps.hasDbOverride).toBe(true);
    expect(beforeProps.isSavingDefault).toBe(false);

    const afterProps = mockDefaultableTextarea.mock.calls[1][0];
    expect(afterProps.defaultValue).toBe('default-after');
    expect(afterProps.hasDbOverride).toBe(false);
    expect(afterProps.isSavingDefault).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'change-Before:' }));
    fireEvent.click(screen.getByRole('button', { name: 'clear-Before:' }));
    fireEvent.click(screen.getByRole('button', { name: 'use-default-Before:' }));
    fireEvent.click(screen.getByRole('button', { name: 'set-default-Before:' }));

    fireEvent.click(screen.getByRole('button', { name: 'change-After:' }));
    fireEvent.click(screen.getByRole('button', { name: 'clear-After:' }));
    fireEvent.click(screen.getByRole('button', { name: 'use-default-After:' }));
    fireEvent.click(screen.getByRole('button', { name: 'set-default-After:' }));

    expect(onChange).toHaveBeenCalledWith({ textBeforePrompts: 'Before:-changed' });
    expect(onChange).toHaveBeenCalledWith({ textBeforePrompts: '' });
    expect(onChange).toHaveBeenCalledWith({ textBeforePrompts: undefined });

    expect(onChange).toHaveBeenCalledWith({ textAfterPrompts: 'After:-changed' });
    expect(onChange).toHaveBeenCalledWith({ textAfterPrompts: '' });
    expect(onChange).toHaveBeenCalledWith({ textAfterPrompts: undefined });

    expect(handleSaveFieldAsDefault).toHaveBeenCalledWith('textBeforePrompts', 'Before:-defaulted');
    expect(handleSaveFieldAsDefault).toHaveBeenCalledWith('textAfterPrompts', 'After:-defaulted');
  });
});
