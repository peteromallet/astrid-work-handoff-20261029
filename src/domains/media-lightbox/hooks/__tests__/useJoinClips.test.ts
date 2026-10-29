import { describe, expect, it, vi } from 'vitest';

const { navigateMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
}));

vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')),
  useNavigate: () => navigateMock,
}));

import { useJoinClips } from '../useJoinClips';

describe('useJoinClips', () => {
  it('exports expected hook', () => {
    expect(useJoinClips).toBeDefined();
    expect(typeof useJoinClips).toBe('function');
    expect(useJoinClips.name).toBeDefined();
  });
});
