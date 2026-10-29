// @vitest-environment jsdom
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RUNTIME_REQUEST_WAIT_MS } from '@/integrations/runtime/useRuntimeRequestWait.ts';
import { RuntimeDocumentNormalizationGate } from './RuntimeDocumentNormalizationGate';

const mocks = vi.hoisted(() => ({
  isConnected: false,
  listProjects: vi.fn(),
  listTimelines: vi.fn(),
  signals: [] as AbortSignal[],
}));

vi.mock('@/integrations/runtime/RuntimeConnectionProvider', () => ({
  useRuntimeConnection: () => ({ isConnected: mocks.isConnected }),
}));
vi.mock('@/integrations/runtime/client', () => ({
  AstridRuntimeClient: class {
    constructor(options?: { signal?: AbortSignal }) {
      if (options?.signal) mocks.signals.push(options.signal);
    }
    listProjects = mocks.listProjects;
    listTimelines = mocks.listTimelines;
  },
}));
vi.mock('@/shared/components/AstridLoading', () => ({ AstridLoading: () => <div>Loading connection</div> }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function Harness() {
  const [connected, setConnected] = useState(false);
  mocks.isConnected = connected;
  const location = useLocation();
  return <>
    <button onClick={() => setConnected(true)}>Connect</button>
    <div data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</div>
    <RuntimeDocumentNormalizationGate><div>Editor route ready</div></RuntimeDocumentNormalizationGate>
  </>;
}

function renderGate() {
  return render(
    <MemoryRouter initialEntries={['/tools/video-editor?project=project-slug&timeline=timeline-alias&filter=video#shot-1']}>
      <Harness />
    </MemoryRouter>,
  );
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('RuntimeDocumentNormalizationGate pending discovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.isConnected = false;
    mocks.signals = [];
    mocks.listProjects.mockReset().mockResolvedValue([{ project_id: 'project-id', slug: 'project-slug' }]);
    mocks.listTimelines.mockReset().mockResolvedValue([{ timeline_id: 'timeline-id', timeline_ulid: 'timeline-alias' }]);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('starts the attention wait only after connection, then shows recovery actions for a hung catalog request', async () => {
    const pendingProjects = deferred<Array<{ project_id: string; slug: string }>>();
    mocks.listProjects.mockReturnValue(pendingProjects.promise);
    renderGate();

    expect(screen.getByText('Loading connection')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(RUNTIME_REQUEST_WAIT_MS));
    expect(screen.queryByRole('heading', { name: 'Still waiting for your workspace' })).toBeNull();
    expect(mocks.listProjects).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(mocks.listProjects).toHaveBeenCalledOnce();
    expect(mocks.signals).toHaveLength(1);
    expect(mocks.signals[0].aborted).toBe(false);
    act(() => vi.advanceTimersByTime(RUNTIME_REQUEST_WAIT_MS));

    expect(screen.getByRole('heading', { name: 'Still waiting for your workspace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open editor' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('project=project-slug');
  });

  it('retries a hung request and ignores its late result when the newer request resolves', async () => {
    const obsolete = deferred<Array<{ project_id: string; slug: string }>>();
    const current = deferred<Array<{ project_id: string; slug: string }>>();
    mocks.listProjects.mockReturnValueOnce(obsolete.promise).mockReturnValueOnce(current.promise);
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(mocks.listProjects).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(RUNTIME_REQUEST_WAIT_MS));

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.listProjects).toHaveBeenCalledTimes(2);
    expect(mocks.signals[0].aborted).toBe(true);
    expect(mocks.signals[1].aborted).toBe(false);

    await act(async () => obsolete.resolve([{ project_id: 'obsolete-id', slug: 'project-slug' }]));
    await flushPromises();
    expect(screen.getByTestId('location')).toHaveTextContent('project=project-slug');

    await act(async () => current.resolve([{ project_id: 'current-id', slug: 'project-slug' }]));
    await flushPromises();
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/tools/video-editor?project=current-id&timeline=timeline-id&filter=video#shot-1',
    );
    expect(screen.getByText('Editor route ready')).toBeInTheDocument();
  });

  it('opens the bare editor route when the person chooses Open editor', async () => {
    mocks.listProjects.mockReturnValue(new Promise(() => undefined));
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    act(() => vi.advanceTimersByTime(RUNTIME_REQUEST_WAIT_MS));

    fireEvent.click(screen.getByRole('button', { name: 'Open editor' }));
    await flushPromises();
    expect(screen.getByTestId('location')).toHaveTextContent('/tools/video-editor');
    expect(screen.getByText('Editor route ready')).toBeInTheDocument();
  });
});
