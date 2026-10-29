import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';
import { ToolLaunchBoundary } from './ToolLaunchBoundary';

describe('ToolLaunchBoundary', () => {
  it('mounts the existing Video Editor page only for the current admitted Tool entry', () => {
    render(<ToolLaunchBoundary toolId={TOOL_IDS.VIDEO_EDITOR}><div data-testid="existing-editor-page" /></ToolLaunchBoundary>);
    expect(screen.getByTestId('existing-editor-page')).toBeInTheDocument();
  });

  it('does not withdraw a legacy host route when it has no catalog entry', () => {
    render(<ToolLaunchBoundary toolId={TOOL_IDS.TRAVEL_BETWEEN_IMAGES}><div data-testid="legacy-page" /></ToolLaunchBoundary>);
    expect(screen.getByTestId('legacy-page')).toBeInTheDocument();
    expect(screen.queryByTestId('tool-unavailable')).not.toBeInTheDocument();
  });
});
