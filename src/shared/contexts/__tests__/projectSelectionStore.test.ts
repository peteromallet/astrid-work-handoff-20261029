// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getProjectSelectionFallbackId,
  initializeProjectSelectionStore,
  resetProjectSelectionStoreForTests,
  setProjectSelectionSnapshot,
} from '../projectSelectionStore';

describe('projectSelectionStore', () => {
  beforeEach(() => {
    resetProjectSelectionStoreForTests();
    vi.restoreAllMocks();
  });

  it('seeds the runtime snapshot from persisted storage during initialization', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('proj-from-storage');

    initializeProjectSelectionStore();

    expect(getProjectSelectionFallbackId()).toBe('proj-from-storage');
  });

  it('does not fall back to stale storage after runtime selection changes', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('proj-from-storage');

    initializeProjectSelectionStore();
    setProjectSelectionSnapshot({ selectedProjectId: null });

    expect(getProjectSelectionFallbackId()).toBeNull();
  });

  it('uses canonical project URL authority over stale storage for Runtime consumers', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('stale-cloud-project');
    window.history.replaceState({}, '', '/tools/image-generation?project=project-a');

    initializeProjectSelectionStore();

    expect(getProjectSelectionFallbackId()).toBe('project-a');
    expect(getProjectSelectionFallbackId()).not.toBe('stale-cloud-project');
  });

  it('does not expose stale storage when a timeline is explicit without its project', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('stale-cloud-project');
    window.history.replaceState({}, '', '/tools/travel-between-images?timeline=main');

    initializeProjectSelectionStore();

    expect(getProjectSelectionFallbackId()).toBeNull();
  });
});
