// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineControls } from './TimelineControls';

const captures = vi.hoisted(() => ({
  bottomProps: null as unknown,
  zoomProps: null as unknown,
}));

vi.mock('./TimelineBottomControls', () => ({
  TimelineBottomControls: (props: unknown) => {
    captures.bottomProps = props;
    return <div data-testid="timeline-bottom-controls">bottom</div>;
  },
}));

vi.mock('./ZoomControls', () => ({
  ZoomControls: (props: unknown) => {
    captures.zoomProps = props;
    return <div data-testid="zoom-controls">zoom</div>;
  },
}));

describe('TimelineControls', () => {
  beforeEach(() => {
    captures.bottomProps = null;
    captures.zoomProps = null;
  });

  function buildProps(overrides: Partial<React.ComponentProps<typeof TimelineControls>> = {}) {
    return {
      timeline: {
        shotId: 'shot-1',
        projectId: 'project-1',
        readOnly: false,
        hasNoImages: false,
        zoomLevel: 1,
        showDragHint: true,
      },
      guidance: {
        primaryStructureVideo: { path: null, treatment: 'adjust', motionStrength: 1, structureType: 'flow' },
        onPrimaryStructureVideoInputChange: vi.fn(),
      },
      zoom: {
        onZoomIn: vi.fn(),
        onZoomOut: vi.fn(),
        onZoomReset: vi.fn(),
        onZoomToStart: vi.fn(),
      },
      bottom: {
        resetGap: false,
        setResetGap: vi.fn(),
        maxGap: 81,
        onReset: vi.fn(),
        onFileDrop: vi.fn(),
        isUploadingImage: false,
        uploadProgress: 0,
        pushMode: false,
      },
      ...overrides,
    } satisfies React.ComponentProps<typeof TimelineControls>;
  }

  it('renders zoom and bottom controls, and offers no audio or guidance-video upload, when the timeline is editable', () => {
    render(<TimelineControls {...buildProps()} />);

    expect(screen.getByTestId('zoom-controls')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add-audio/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('timeline-bottom-controls')).toBeInTheDocument();
    expect(captures.zoomProps).toMatchObject({
      zoomLevel: 1,
      hasNoImages: false,
    });
    expect(captures.bottomProps).toMatchObject({
      readOnly: false,
      showDragHint: true,
      pushMode: false,
    });
  });

  it('omits top controls when the primary structure video is absent in read-only mode', () => {
    render(
      <TimelineControls
        {...buildProps({
          timeline: {
            ...buildProps().timeline,
            readOnly: true,
          },
        })}
      />,
    );

    expect(screen.queryByTestId('zoom-controls')).not.toBeInTheDocument();
    expect(screen.getByTestId('timeline-bottom-controls')).toBeInTheDocument();
  });
});
