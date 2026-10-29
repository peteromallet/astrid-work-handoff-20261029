// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Project } from '@/integrations/runtime/generated.ts';
import { AstridTravelRoute } from './AstridTravelRoute.tsx';

const mocks = vi.hoisted(() => ({ discovery: null as any }));
vi.mock('@/tools/video-editor/hooks/useRuntimeEditorDiscovery.ts', () => ({
  useRuntimeEditorDiscovery: () => mocks.discovery,
  chooseRuntimeTimeline: (_project: Project, timelines: any[]) => timelines.find((t) => t.is_default),
}));
vi.mock('./LocalTimelineShotBrowser.tsx', () => ({
  LocalTimelineShotBrowser: (props: { projectSlug: string; projectId?: string; timelineRef: string }) => (
    <div data-testid="shot-browser" data-project={props.projectId} data-timeline={props.timelineRef} />
  ),
}));
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="route-search">{location.search}</output>;
}
function HistoryProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="route-location">{location.pathname}{location.search}{location.hash}</output><button onClick={() => navigate(-1)}>Back</button></>;
}

const project: Project = {
  project_id: 'project-id', realm_id: 'realm', slug: 'project-slug', name: 'Project',
  metadata: {}, version: 1, created_at: '', updated_at: '',
};

describe('AstridTravelRoute', () => {
  it('opens the canonical timeline without rewriting the URL', () => {
    mocks.discovery = {
      project,
      projectsQuery: { isLoading: false, error: null },
      timelinesQuery: { data: [{ timeline_id: 'timeline-id', timeline_ulid: 'timeline-alias', name: 'Main' }], isLoading: false, error: null },
    };
    render(<MemoryRouter initialEntries={['/tools/travel-between-images?project=project-id&timeline=timeline-id']}>
      <LocationProbe /><AstridTravelRoute />
    </MemoryRouter>);
    expect(screen.getByTestId('shot-browser')).toHaveAttribute('data-project', 'project-id');
    expect(screen.getByTestId('shot-browser')).toHaveAttribute('data-timeline', 'timeline-id');
    expect(screen.getByTestId('route-search')).toHaveTextContent('?project=project-id&timeline=timeline-id');
  });
  it('replaces the default timeline in the URL while preserving the shot hash', async () => {
    mocks.discovery = {
      project,
      projectsQuery: { isLoading: false, error: null },
      timelinesQuery: { data: [{ timeline_id: 'timeline-id', is_default: true }], isLoading: false, error: null },
    };
    render(<MemoryRouter initialEntries={[
      '/tools/travel-between-images?project=previous-project&timeline=previous-timeline',
      '/tools/travel-between-images?project=project-id#shot%2F1',
    ]} initialIndex={1}>
      <HistoryProbe /><AstridTravelRoute />
    </MemoryRouter>);

    expect(screen.getByTestId('shot-browser')).toHaveAttribute('data-timeline', 'timeline-id');
    await waitFor(() => expect(screen.getByTestId('route-location')).toHaveTextContent(
      '/tools/travel-between-images?project=project-id&timeline=timeline-id#shot%2F1',
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByTestId('route-location')).toHaveTextContent(
      '/tools/travel-between-images?project=previous-project&timeline=previous-timeline',
    ));
  });
  it('reports an explicitly missing timeline', () => {
    mocks.discovery = {
      project,
      projectsQuery: { isLoading: false, error: null },
      timelinesQuery: { data: [{ timeline_id: 'existing' }], isLoading: false, error: null },
    };
    render(<MemoryRouter initialEntries={['/tools/travel-between-images?project=project-id&timeline=missing']}>
      <AstridTravelRoute />
    </MemoryRouter>);
    expect(screen.getByText('Astrid timeline not found')).toBeInTheDocument();
  });
});
