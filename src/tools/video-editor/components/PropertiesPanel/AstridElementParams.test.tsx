// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TimelineEditability } from '@/tools/video-editor/lib/timeline-editability.ts';
import type { AstridElementDescriptor } from '@/tools/video-editor/runtime/astrid-element-host.ts';
import type { ResolvedTimelineClip, ResolvedTimelineConfig } from '@/tools/video-editor/types/index.ts';
import { AstridElementParams } from './AstridElementParams.tsx';
import type { ClipPanelProps } from './ClipPanelBody.tsx';
import { resolveAstridElementParamDescriptor } from './astrid-element-param-descriptor.ts';

const runtimeState = vi.hoisted(() => ({
  descriptors: [] as AstridElementDescriptor[],
  timelineEditability: undefined as TimelineEditability | undefined,
}));

vi.mock('@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx', () => ({
  useVideoEditorRuntime: () => ({
    astridElementHost: { descriptors: runtimeState.descriptors },
    timelineEditability: runtimeState.timelineEditability,
  }),
}));

const descriptor: AstridElementDescriptor = {
  id: 'v3-glow',
  kind: 'effect',
  packId: 'astrid-v3',
  revision: 'rev-7',
  componentPath: 'packs/v3/glow',
  schema: {
    title: 'Glow',
    properties: {
      selectedSegmentIndex: { type: 'number', title: 'Selected Segment Index' },
    },
  },
};

function clipFor(
  reference: Pick<AstridElementDescriptor, 'id' | 'kind' | 'packId' | 'revision'>,
  params: Record<string, unknown> = {},
): ResolvedTimelineClip {
  return {
    id: 'clip-v3-glow',
    at: 0,
    track: 'V1',
    hold: 2,
    clipType: 'effect-layer',
    elementRef: reference,
    params,
  } as unknown as ResolvedTimelineClip;
}

function renderForm({
  reference = descriptor,
  params = {},
  readOnly = false,
  onChange = vi.fn(),
}: {
  reference?: Pick<AstridElementDescriptor, 'id' | 'kind' | 'packId' | 'revision'>;
  params?: Record<string, unknown>;
  readOnly?: boolean;
  onChange?: ClipPanelProps['onChange'];
} = {}) {
  runtimeState.descriptors = [descriptor];
  return {
    ...render(
      <AstridElementParams
        clip={clipFor(reference, params)}
        readOnly={readOnly}
        registry={{} as ResolvedTimelineConfig['registry']}
        onChange={onChange}
      />,
    ),
    onChange,
  };
}

describe('AstridElementParams', () => {
  it('matches the exact host owner and pinned revision', () => {
    const clip = clipFor(descriptor);
    expect(resolveAstridElementParamDescriptor(clip, [descriptor], false, undefined)).toBe(descriptor);
    expect(resolveAstridElementParamDescriptor(
      clipFor({ ...descriptor, packId: 'other-owner' }),
      [descriptor],
      false,
      undefined,
    )).toBeUndefined();
    expect(resolveAstridElementParamDescriptor(
      clipFor({ ...descriptor, revision: 'stale-revision' }),
      [descriptor],
      false,
      undefined,
    )).toBeUndefined();

    renderForm();
    expect(screen.getByTestId('astrid-element-params')).toBeTruthy();
  });

  it('preserves existing params and writes through the current host descriptor', () => {
    const { onChange } = renderForm({ params: { selectedSegmentIndex: 2, futureParam: 'keep-me' } });
    fireEvent.change(screen.getByLabelText('Selected Segment Index'), { target: { value: '1' } });
    expect(onChange).toHaveBeenLastCalledWith({
      params: { selectedSegmentIndex: 1, futureParam: 'keep-me' },
    });
  });

  it('does not expose the form for read-only timelines or stale host registrations', () => {
    const readOnly = renderForm({ readOnly: true });
    expect(screen.queryByTestId('astrid-element-params')).toBeNull();
    readOnly.unmount();

    const stale = renderForm({ reference: { ...descriptor, revision: 'stale-revision' } });
    expect(screen.queryByTestId('astrid-element-params')).toBeNull();
    stale.unmount();
  });

  it('uses distinct field ids for two form instances', () => {
    runtimeState.descriptors = [descriptor];
    render(
      <>
        <AstridElementParams
          clip={clipFor(descriptor)}
          registry={{} as ResolvedTimelineConfig['registry']}
          onChange={() => undefined}
        />
        <AstridElementParams
          clip={clipFor(descriptor)}
          registry={{} as ResolvedTimelineConfig['registry']}
          onChange={() => undefined}
        />
      </>,
    );
    const fields = screen.getAllByLabelText('Selected Segment Index');
    expect(fields).toHaveLength(2);
    expect(fields[0].id).not.toBe(fields[1].id);
  });
});
