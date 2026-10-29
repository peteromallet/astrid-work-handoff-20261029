// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getQuantizedGap } from '../../JoinClipsSettingsForm/utils';

vi.mock('lucide-react', () => ({
  Trash2: () => <svg aria-label="Remove selection" />,
}));

vi.mock('./SegmentThumbnail', () => ({
  SegmentThumbnail: ({ videoUrl, time }: { videoUrl: string; time: number }) => (
    <div data-testid="segment-thumbnail">
      {videoUrl}:{time}
    </div>
  ),
}));

vi.mock('../../ui/input', () => ({
  Input: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder: string;
  }) => <input value={value} onChange={onChange} placeholder={placeholder} />,
}));

vi.mock('../../ui/slider', () => ({
  Slider: ({
    value,
    onValueChange,
    min,
    max,
    step,
  }: {
    value: number;
    onValueChange: (value: number) => void;
    min: number;
    max: number;
    step: number;
  }) => (
    <input
      aria-label="Gap slider"
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(event) => onValueChange(Number(event.currentTarget.value))}
    />
  ),
}));

vi.mock('../../ui/textarea', () => ({
  Textarea: ({
    value,
    onChange,
    placeholder,
    onClear,
  }: {
    value: string;
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
    placeholder: string;
    onClear?: () => void;
  }) => (
    <div>
      <textarea value={value} onChange={onChange} placeholder={placeholder} />
      <button type="button" onClick={onClear}>
        Clear prompt
      </button>
    </div>
  ),
}));

const { PortionSelectionCard } = await import('./PortionSelectionCard');

describe('PortionSelectionCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders selection details and fan-outs local updates', () => {
    const onUpdateSelectionSettings = vi.fn();
    const onRemoveSelection = vi.fn();

    render(
      <PortionSelectionCard
        selection={{
          id: 'segment-1',
          start: 1,
          end: 3,
          gapFrameCount: 9,
          prompt: 'Original prompt',
          name: 'Intro',
        }}
        index={0}
        totalSelections={2}
        gapFrames={13}
        contextFrames={8}
        videoUrl="video.mp4"
        fps={8}
        onUpdateSelectionSettings={onUpdateSelectionSettings}
        onRemoveSelection={onRemoveSelection}
      />,
    );

    expect(screen.getAllByTestId('segment-thumbnail')).toHaveLength(2);
    expect(screen.getByText('= 1.1s @ 8fps')).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue('Intro'), {
      target: { value: 'Renamed segment' },
    });
    expect(onUpdateSelectionSettings).toHaveBeenCalledWith('segment-1', {
      name: 'Renamed segment',
    });

    fireEvent.change(screen.getByLabelText('Gap slider'), {
      target: { value: '12' },
    });
    expect(onUpdateSelectionSettings).toHaveBeenCalledWith('segment-1', {
      gapFrameCount: getQuantizedGap(12, 8),
    });

    fireEvent.change(screen.getByDisplayValue('Original prompt'), {
      target: { value: 'Updated prompt' },
    });
    expect(onUpdateSelectionSettings).toHaveBeenCalledWith('segment-1', {
      prompt: 'Updated prompt',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear prompt' }));
    expect(onUpdateSelectionSettings).toHaveBeenCalledWith('segment-1', {
      prompt: '',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove selection' }));
    expect(onRemoveSelection).toHaveBeenCalledWith('segment-1');
  });

  it('omits remove and duration affordances when they do not apply', () => {
    render(
      <PortionSelectionCard
        selection={{
          id: 'segment-1',
          start: 1,
          end: 3,
        }}
        index={0}
        totalSelections={1}
        gapFrames={13}
        contextFrames={8}
        fps={null}
        onUpdateSelectionSettings={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Remove selection' })).toBeNull();
    expect(screen.queryByText(/@ .*fps$/)).toBeNull();
    expect(screen.queryAllByTestId('segment-thumbnail')).toHaveLength(0);
  });
});
