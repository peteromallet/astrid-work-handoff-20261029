import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateProjectModal } from './CreateProjectModal';

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProjectSelectionContext: () => ({ selectedProjectId: 'current-project' }),
  useProjectCrudContext: () => ({ addNewProject: mocks.create, isCreatingProject: false, projects: [] }),
}));
vi.mock('@/shared/components/GenerationControls/AspectRatioSelector', () => ({ AspectRatioSelector: () => null }));
vi.mock('@/shared/components/ModalContainer', () => ({
  ModalContainer: ({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) => <div>{children}{footer}</div>,
  ModalFooterButtons: ({ onConfirm }: { onConfirm: () => void }) => <button onClick={onConfirm}>Create Project</button>,
}));
function RouteProbe() {
  const location = useLocation();
  return <output data-testid="route">{location.pathname + location.search}</output>;
}

describe('CreateProjectModal navigation', () => {
  beforeEach(() => mocks.create.mockReset());

  it.each([true, false])('uses the current editor guard after creation completes (allowed: %s)', async (allowed) => {
    let complete!: (project: { id: string }) => void;
    mocks.create.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    const onProjectCreated = vi.fn();
    const onOpenChange = vi.fn();
    const guard = vi.fn(() => true);
    const tree = () => <MemoryRouter initialEntries={['/tools/video-editor?project=current-project&timeline=current-timeline']}>
      <RouteProbe />
      <CreateProjectModal isOpen initialName="New project" onOpenChange={onOpenChange} onProjectCreated={onProjectCreated} confirmNavigation={guard} />
    </MemoryRouter>;
    const view = render(tree());
    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    guard.mockReturnValue(allowed);
    view.rerender(tree());
    await act(async () => complete({ id: 'canonical-project-id' }));
    expect(onProjectCreated).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(guard).toHaveBeenCalledOnce();
    expect(screen.getByTestId('route')).toHaveTextContent(allowed
      ? '/tools/video-editor?project=canonical-project-id'
      : '/tools/video-editor?project=current-project&timeline=current-timeline');
  });
});
