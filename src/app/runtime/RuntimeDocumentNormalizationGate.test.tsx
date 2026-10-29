// @vitest-environment jsdom
import React, { useEffect, useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeDocumentNormalizationGate } from './RuntimeDocumentNormalizationGate';

const mocks = vi.hoisted(() => ({
  isConnected: false,
  listProjects: vi.fn(),
  listTimelines: vi.fn(),
}));

vi.mock('@/integrations/runtime/RuntimeConnectionProvider', () => ({
  useRuntimeConnection: () => ({ isConnected: mocks.isConnected }),
}));
vi.mock('@/integrations/runtime/client', () => ({
  AstridRuntimeClient: class {
    listProjects = mocks.listProjects;
    listTimelines = mocks.listTimelines;
  },
}));
vi.mock('@/shared/components/AstridLoading', () => ({ AstridLoading: () => <div>loading</div> }));
vi.mock('@/shared/components/RuntimeConnection/RuntimeConnectorRecoveryBanner', () => ({
  RuntimeConnectorRecoveryBanner: ({ onRetry }: { onRetry: () => void }) => <button onClick={onRetry}>retry recovery</button>,
}));

function RouteProbe() {
  const location = useLocation();
  return <div data-testid="route">{`${location.pathname}${location.search}${location.hash}`}</div>;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="outside-route">{`${location.pathname}${location.search}${location.hash}`}</div>;
}

function PersistentChild() {
  const navigate = useNavigate();
  const [mounts, setMounts] = useState(0);
  useEffect(() => setMounts((value) => value + 1), []);
  return <><div data-testid="child-mounts">{mounts}</div><button onClick={() => navigate('/tools/video-editor?project=picker-project')}>pick project</button></>;
}

function Harness() {
  const [connected, setConnected] = useState(false);
  mocks.isConnected = connected;
  return (
    <>
      <button onClick={() => setConnected(true)}>connect</button>
      <LocationProbe />
      <RuntimeDocumentNormalizationGate><RouteProbe /></RuntimeDocumentNormalizationGate>
    </>
  );
}

describe('RuntimeDocumentNormalizationGate', () => {
  beforeEach(() => {
    mocks.isConnected = false;
    mocks.listProjects.mockReset().mockResolvedValue([{ project_id: 'project-id', slug: 'project-slug' }]);
    mocks.listTimelines.mockReset().mockResolvedValue([{ timeline_id: 'timeline-id', timeline_ulid: 'timeline-alias' }]);
  });

  it('waits for connection before resolving and replacing the opening URL once', async () => {
    render(
      <MemoryRouter initialEntries={['/tools/video-editor?project=project-slug&timeline=timeline-alias&filter=video#shot-1']}>
        <Harness />
      </MemoryRouter>,
    );

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(mocks.listProjects).not.toHaveBeenCalled();
    act(() => screen.getByText('connect').click());

    await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent(
      '/tools/video-editor?project=project-id&timeline=timeline-id&filter=video#shot-1',
    ));
    expect(mocks.listProjects).toHaveBeenCalledTimes(1);
    expect(mocks.listTimelines).toHaveBeenCalledTimes(1);
  });

  it('keeps the original URL after catalog failure and retries resolution successfully', async () => {
    const openingUrl = '/tools/video-editor?project=project-slug&timeline=timeline-alias&filter=video#shot-1';
    mocks.listProjects.mockRejectedValueOnce(new Error('catalog unavailable'));
    render(
      <MemoryRouter initialEntries={[openingUrl]}>
        <Harness />
      </MemoryRouter>,
    );

    act(() => screen.getByText('connect').click());
    expect(await screen.findByText('retry recovery')).toBeInTheDocument();
    expect(screen.getByTestId('outside-route')).toHaveTextContent(openingUrl);
    expect(mocks.listProjects).toHaveBeenCalledTimes(1);

    act(() => screen.getByText('retry recovery').click());
    await waitFor(() => expect(screen.getByTestId('outside-route')).toHaveTextContent(
      '/tools/video-editor?project=project-id&timeline=timeline-id&filter=video#shot-1',
    ));
    expect(mocks.listProjects).toHaveBeenCalledTimes(2);
  });

  it('does not rerun discovery or remount children after canonical picker navigation', async () => {
    mocks.isConnected = true;
    render(
      <MemoryRouter initialEntries={['/tools/video-editor?project=project-slug']}>
        <RuntimeDocumentNormalizationGate><PersistentChild /></RuntimeDocumentNormalizationGate>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('child-mounts')).toHaveTextContent('1');
    expect(mocks.listProjects).toHaveBeenCalledTimes(1);
    act(() => screen.getByText('pick project').click());
    await waitFor(() => expect(screen.getByTestId('child-mounts')).toHaveTextContent('1'));
    expect(mocks.listProjects).toHaveBeenCalledTimes(1);
  });

  it('cancels the discarded StrictMode resolution without resolving the canonical replacement again', async () => {
    mocks.isConnected = true;
    render(
      <React.StrictMode>
        <MemoryRouter initialEntries={['/tools/video-editor?localProject=project-slug&localTimeline=timeline-alias']}>
          <RuntimeDocumentNormalizationGate><RouteProbe /></RuntimeDocumentNormalizationGate>
        </MemoryRouter>
      </React.StrictMode>,
    );

    await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent(
      '/tools/video-editor?project=project-id&timeline=timeline-id',
    ));
    // StrictMode starts two effects, but the replaced location starts none.
    expect(mocks.listProjects).toHaveBeenCalledTimes(2);
  });
});
