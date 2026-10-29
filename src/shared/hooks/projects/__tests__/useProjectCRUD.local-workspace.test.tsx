import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectCRUD } from '../useProjectCRUD';

const mocks = vi.hoisted(() => ({
  clientOptions: [] as unknown[],
  createProject: vi.fn(),
  listProjects: vi.fn(),
  updateProject: vi.fn(),
  ensureProjectHasTimeline: vi.fn(),
}));

vi.mock('@/integrations/astrid/client', () => ({
  AstridLocalClient: class MockAstridLocalClient {
    projects = {
      create: mocks.createProject,
      list: mocks.listProjects,
      update: mocks.updateProject,
    };

    constructor(options: unknown) {
      mocks.clientOptions.push(options);
    }
  },
}));

vi.mock('@/integrations/runtime/createDefaultTimeline', () => ({
  ensureProjectHasTimeline: mocks.ensureProjectHasTimeline,
}));

describe('useProjectCRUD local workspace project creation', () => {
  beforeEach(() => {
    mocks.clientOptions = [];
    mocks.createProject.mockReset().mockResolvedValue({
      data: {
        project_id: 'project-canonical-id',
        slug: 'astrid-local-launch-smoke-2026-10-14',
        name: 'Astrid local launch smoke 2026-10-14',
        metadata: { aspect_ratio: '16:9' },
        created_at: '2026-10-14T00:00:00.000Z',
      },
    });
    mocks.listProjects.mockReset();
    mocks.updateProject.mockReset();
    mocks.ensureProjectHasTimeline.mockReset().mockResolvedValue('created-main-timeline');
    window.history.replaceState({}, '', '/tools/video-editor');
  });

  it('creates through workspace.v1 before a project is selected or present in the URL', async () => {
    const onProjectsLoaded = vi.fn();
    const onProjectCreated = vi.fn();
    const { result } = renderHook(() => useProjectCRUD({
      userId: 'local-user',
      selectedProjectId: null,
      onProjectsLoaded,
      onProjectCreated,
      onProjectDeleted: vi.fn(),
      updateUserSettings: vi.fn(async () => undefined),
    }));

    let createdProject;
    await act(async () => {
      createdProject = await result.current.addNewProject({
        name: 'Astrid local launch smoke 2026-10-14',
        aspectRatio: '16:9',
      });
    });

    expect(mocks.clientOptions).toEqual([{ projectSlug: '__discovery__' }]);
    expect(mocks.createProject).toHaveBeenCalledWith({
      name: 'Astrid local launch smoke 2026-10-14',
      slug: 'astrid-local-launch-smoke-2026-10-14',
      metadata: { aspect_ratio: '16:9' },
    });
    expect(mocks.ensureProjectHasTimeline).toHaveBeenCalledWith('project-canonical-id');
    expect(createdProject).toMatchObject({
      id: 'project-canonical-id',
      name: 'Astrid local launch smoke 2026-10-14',
      user_id: 'local-user',
      aspectRatio: '16:9',
    });
    expect(onProjectCreated).toHaveBeenCalledWith(createdProject);
    expect(onProjectsLoaded).not.toHaveBeenCalled();
  });

  it('keeps the created project and callback usable when first timeline creation needs a retry', async () => {
    mocks.ensureProjectHasTimeline.mockRejectedValueOnce(new Error('Runtime temporarily unavailable'));
    const onProjectCreated = vi.fn();
    const { result } = renderHook(() => useProjectCRUD({
      userId: 'local-user',
      selectedProjectId: null,
      onProjectsLoaded: vi.fn(),
      onProjectCreated,
      onProjectDeleted: vi.fn(),
      updateUserSettings: vi.fn(async () => undefined),
    }));

    let createdProject;
    await act(async () => {
      createdProject = await result.current.addNewProject({
        name: 'Astrid local launch smoke 2026-10-14',
        aspectRatio: '16:9',
      });
    });

    expect(createdProject).toMatchObject({ id: 'project-canonical-id' });
    expect(onProjectCreated).toHaveBeenCalledWith(createdProject);
  });

  it('updates the canonical project when another project slug collides with its ID', async () => {
    window.history.replaceState({}, '', '/tools/video-editor?project=canonical-target');
    const projects = [
      {
        project_id: 'other-project-id',
        slug: 'canonical-target',
        version: 4,
        name: 'Wrong project',
        metadata: { aspect_ratio: '1:1', marker: 'wrong' },
      },
      {
        project_id: 'canonical-target',
        slug: 'target-project-slug',
        version: 12,
        name: 'Target project',
        metadata: { aspect_ratio: '16:9', marker: 'target' },
        created_at: '2026-10-14T00:00:00.000Z',
      },
    ];
    mocks.listProjects.mockResolvedValue(projects);
    mocks.updateProject.mockResolvedValue({
      project_id: 'canonical-target',
      slug: 'target-project-slug',
      name: 'Renamed target',
      metadata: { aspect_ratio: '16:9', marker: 'target' },
      created_at: '2026-10-14T00:00:00.000Z',
    });
    const { result } = renderHook(() => useProjectCRUD({
      userId: 'local-user',
      selectedProjectId: 'canonical-target',
      onProjectsLoaded: vi.fn(),
      onProjectCreated: vi.fn(),
      onProjectDeleted: vi.fn(),
      updateUserSettings: vi.fn(async () => undefined),
    }));

    let succeeded: boolean | undefined;
    await act(async () => {
      succeeded = await result.current.updateProject('canonical-target', { name: 'Renamed target' });
    });

    expect(succeeded).toBe(true);
    expect(mocks.clientOptions).toEqual([
      { projectSlug: '__discovery__' },
      { projectSlug: 'target-project-slug' },
    ]);
    expect(mocks.updateProject).toHaveBeenCalledWith({
      projectId: 'canonical-target',
      expectedVersion: 12,
      name: 'Renamed target',
      metadata: { aspect_ratio: '16:9', marker: 'target' },
    });
  });
});
