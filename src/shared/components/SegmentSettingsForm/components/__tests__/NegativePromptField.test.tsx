import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NegativePromptField } from '../NegativePromptField';

const mockDefaultableTextarea = vi.fn();

vi.mock('@/shared/components/DefaultableTextarea', () => ({
  DefaultableTextarea: (props: Record<string, unknown>) => {
    mockDefaultableTextarea(props);
    return (
      <div data-testid="defaultable-textarea">
        <button type="button" onClick={() => (props.onChange as (value: string) => void)('new negative')}>change</button>
        <button type="button" onClick={() => (props.onClear as () => void)()}>clear</button>
        <button type="button" onClick={() => (props.onUseDefault as () => void)()}>use-default</button>
        <button
          type="button"
          onClick={() => {
            const fn = props.onSetAsDefault as ((value: string) => Promise<void>) | undefined;
            void fn?.('defaulted value');
          }}
        >
          set-default
        </button>
      </div>
    );
  },
}));

function buildSettings(overrides: Record<string, unknown> = {}) {
  return {
    prompt: '',
    negativePrompt: 'initial negative',
    motionMode: 'basic',
    amountOfMotion: 50,
    selectedPhasePresetId: null,
    loras: [],
    numFrames: 61,
    randomSeed: true,
    makePrimaryVariant: false,
    ...overrides,
  };
}

describe('NegativePromptField', () => {
  it('wires textarea callbacks into segment updates and default-saving handlers', async () => {
    const onChange = vi.fn();
    const handleSaveFieldAsDefault = vi.fn(async () => undefined);

    render(
      <NegativePromptField
        settings={buildSettings() as never}
        onChange={onChange}
        shotDefaults={{ negativePrompt: 'shot default negative' } as never}
        hasOverride={{ negativePrompt: true } as never}
        onSaveFieldAsDefault={vi.fn() as never}
        handleSaveFieldAsDefault={handleSaveFieldAsDefault as never}
        savingField="negativePrompt"
      />,
    );

    expect(screen.getByTestId('defaultable-textarea')).toBeInTheDocument();

    const passedProps = mockDefaultableTextarea.mock.calls[0][0];
    expect(passedProps.label).toBe('Negative Prompt:');
    expect(passedProps.value).toBe('initial negative');
    expect(passedProps.defaultValue).toBe('shot default negative');
    expect(passedProps.hasDbOverride).toBe(true);
    expect(passedProps.isSavingDefault).toBe(true);
    expect(Object.keys(passedProps).filter((key) => /voice/i.test(key))).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'change' }));
    fireEvent.click(screen.getByRole('button', { name: 'clear' }));
    fireEvent.click(screen.getByRole('button', { name: 'use-default' }));
    fireEvent.click(screen.getByRole('button', { name: 'set-default' }));

    expect(onChange).toHaveBeenCalledWith({ negativePrompt: 'new negative' });
    expect(onChange).toHaveBeenCalledWith({ negativePrompt: '' });
    expect(onChange).toHaveBeenCalledWith({ negativePrompt: undefined });
    expect(handleSaveFieldAsDefault).toHaveBeenCalledWith('negativePrompt', 'defaulted value');
  });

  it('omits onSetAsDefault when no save-default handler is provided', () => {
    render(
      <NegativePromptField
        settings={buildSettings() as never}
        onChange={vi.fn()}
        handleSaveFieldAsDefault={vi.fn(async () => undefined) as never}
        savingField={null}
      />,
    );

    const passedProps = mockDefaultableTextarea.mock.calls[1][0];
    expect(passedProps.onSetAsDefault).toBeUndefined();
    expect(passedProps.isSavingDefault).toBe(false);
  });
});
