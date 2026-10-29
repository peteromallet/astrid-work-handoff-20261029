// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AI_GENERATION_DRAFT,
  CREATE_ANIMATION_PROMPT,
  EFFECT_OR_ANIMATION_DRAFT,
  EXTENSION_DRAFT,
  TimelineCreateTools,
} from '@/tools/video-editor/components/TimelineEditor/TimelineCreateTools.tsx';

const noop = () => {};

describe('TimelineCreateTools', () => {
  it('shows AI generation, extension and effect-or-animation buttons in that order, each wired to its handler', () => {
    const onCreateImageGeneration = vi.fn();
    const onCreateExtension = vi.fn();
    const onCreateEffect = vi.fn();
    render(
      <TimelineCreateTools
        labelWidth={144}
        onCreateImageGeneration={onCreateImageGeneration}
        onCreateExtension={onCreateExtension}
        onCreateEffect={onCreateEffect}
      />,
    );

    const cluster = screen.getByTestId('timeline-tool-buttons');
    const buttons = within(cluster).getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'New AI generation',
      'New extension',
      'New effect or animation',
    ]);
    buttons.forEach((button) => expect(button.className).toContain('h-6 w-6'));

    fireEvent.click(screen.getByRole('button', { name: 'New AI generation' }));
    fireEvent.click(screen.getByRole('button', { name: 'New extension' }));
    fireEvent.click(screen.getByRole('button', { name: 'New effect or animation' }));
    expect(onCreateImageGeneration).toHaveBeenCalledTimes(1);
    expect(onCreateExtension).toHaveBeenCalledTimes(1);
    expect(onCreateEffect).toHaveBeenCalledTimes(1);
  });

  it('keeps the effect tool as an effect-layer HTML5 drag source when the host has no prompt flow', () => {
    render(<TimelineCreateTools labelWidth={144} onCreateEffect={noop} effectDragSource />);

    const effect = screen.getByLabelText('New effect or animation');
    expect(effect.getAttribute('draggable')).toBe('true');
    const transfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(effect, { dataTransfer: transfer });
    expect(transfer.setData).toHaveBeenCalledWith('effect-layer', 'true');
    expect(transfer.effectAllowed).toBe('copy');
  });

  it('shows only the tools it is given, just right of the track-name column', () => {
    render(<TimelineCreateTools labelWidth={144} onCreateExtension={noop} />);

    expect(screen.getByRole('button', { name: 'New extension' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New AI generation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New effect or animation' })).toBeNull();
    const cluster = screen.getByTestId('timeline-tool-buttons');
    expect(cluster.style.left).toBe('152px');
    expect(cluster.className).toContain('sticky');
  });

  it('keeps pointer-down from reaching the timeline behind it', () => {
    const onParentPointerDown = vi.fn();
    render(
      <div onPointerDown={onParentPointerDown}>
        <TimelineCreateTools labelWidth={144} onCreateExtension={noop} />
      </div>,
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: 'New extension' }));
    expect(onParentPointerDown).not.toHaveBeenCalled();
  });

  it('gives each footer tool its own draft, and the icon and tint that go with it', () => {
    const dir = join(import.meta.dirname, '..');
    const sources = [
      'TimelineEditor/TimelineCanvas.tsx',
      'TimelineEditor/TimelineCreateTools.tsx',
      'TimelineEditorShellCore.tsx',
    ].map((file) => readFileSync(join(dir, file), 'utf8'));
    const occurrences = (needle: string) => sources.reduce((count, source) => count + source.split(needle).length - 1, 0);

    expect(AI_GENERATION_DRAFT).toBe('Generate a new image or video of ');
    expect(EXTENSION_DRAFT).toBe('Build a new extension that ');
    expect(EFFECT_OR_ANIMATION_DRAFT).toBe('Create a custom effect or animation that ');
    expect(CREATE_ANIMATION_PROMPT).toBe("I'd like to create an animation.");
    for (const draft of [AI_GENERATION_DRAFT, EXTENSION_DRAFT, EFFECT_OR_ANIMATION_DRAFT, CREATE_ANIMATION_PROMPT]) {
      expect(occurrences(draft)).toBe(1);
    }
  });

  it('colours each icon by its tool: extension is Spline in blue, effect or animation is Layers in purple', () => {
    render(<TimelineCreateTools labelWidth={144} onCreateExtension={noop} onCreateEffect={noop} />);
    const extension = screen.getByRole('button', { name: 'New extension' });
    const effect = screen.getByRole('button', { name: 'New effect or animation' });
    expect(extension.querySelector('svg')?.getAttribute('class')).toContain('lucide-spline');
    expect(extension.className).toContain('--video-editor-accent-bg-strong');
    expect(effect.querySelector('svg')?.getAttribute('class')).toContain('lucide-layers');
    expect(effect.className).toContain('--video-editor-effect-bg)');
  });
});
