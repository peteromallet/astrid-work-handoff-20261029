// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AvailableSequenceMetadata } from '@/tools/video-editor/sequences/registry.ts';
import type { ResolvedTimelineConfig } from '@/tools/video-editor/types/index.ts';
import { SequenceParamEditor } from './SequenceParamEditor.tsx';

const metadata = (params: AvailableSequenceMetadata['params']): AvailableSequenceMetadata => ({
  clipType: 'legacy-sequence',
  themeId: 'test-theme',
  label: 'Legacy Sequence',
  description: 'Legacy sequence fields.',
  whenToUse: 'Legacy test fixture.',
  hold: { defaultSeconds: 2, minSeconds: 1, maxSeconds: 4, stepSeconds: 1 },
  params,
});

const props = {
  clipType: 'unregistered-test-sequence',
  params: {},
  registry: {} as ResolvedTimelineConfig['registry'],
  onChange: () => undefined,
};

describe('SequenceParamEditor empty state', () => {
  it('keeps the warning when no Astrid form owns the empty state', () => {
    render(<SequenceParamEditor {...props} metadata={metadata([])} />);
    expect(screen.getByText('This clip type does not expose editable sequence params in the current registry view.')).toBeTruthy();
  });

  it('hides only the empty warning when an active Astrid form owns it', () => {
    const { container } = render(<SequenceParamEditor {...props} metadata={metadata([])} hideEmptyState />);
    expect(container.textContent).toBe('');
  });

  it('keeps nonempty legacy controls when the Astrid form is also active', () => {
    render(
      <SequenceParamEditor
        {...props}
        metadata={metadata([{
          key: 'legacyTitle',
          label: 'Legacy title',
          kind: 'string',
          description: 'A legacy parameter.',
          defaultValue: 'Keep me',
        }])}
        hideEmptyState
      />,
    );
    expect(screen.getByText('Legacy Sequence')).toBeTruthy();
    expect(screen.getByText('Legacy title')).toBeTruthy();
    expect(screen.queryByText('This clip type does not expose editable sequence params in the current registry view.')).toBeNull();
  });
});
