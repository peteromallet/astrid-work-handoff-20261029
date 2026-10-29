import { describe, expect, it } from 'vitest';
import { describeEmptyState, type EmptyStateInput } from './emptyState';

const BASE: EmptyStateInput = {
  mediaType: 'all',
  starredOnly: false,
  searchTerm: '',
  shotScope: { kind: 'all' },
};

describe('describeEmptyState', () => {
  it.each<[string, Partial<EmptyStateInput>, string]>([
    ['no filters', {}, 'No generations yet.'],
    ['whitespace-only search is not a filter', { searchTerm: '   ' }, 'No generations yet.'],
    ['starred only', { starredOnly: true }, 'Nothing starred'],
    ['starred + type', { starredOnly: true, mediaType: 'video' }, 'Nothing starred in Videos'],
    ['starred + image type', { starredOnly: true, mediaType: 'image' }, 'Nothing starred in Images'],
    ['starred + audio type', { starredOnly: true, mediaType: 'audio' }, 'Nothing starred in Audio'],
    ['type only: video', { mediaType: 'video' }, 'No videos'],
    ['type only: image', { mediaType: 'image' }, 'No images'],
    ['type only: audio', { mediaType: 'audio' }, 'No audio'],
    ['search, all types', { searchTerm: 'fox' }, 'Nothing matches "fox"'],
    ['search, type', { searchTerm: 'fox', mediaType: 'video' }, 'No videos match "fox"'],
    ['search, starred', { searchTerm: 'fox', starredOnly: true }, 'Nothing starred matches "fox"'],
    [
      'search, starred + type',
      { searchTerm: 'fox', starredOnly: true, mediaType: 'video' },
      'No starred videos match "fox"',
    ],
    ['search is trimmed', { searchTerm: '  fox  ' }, 'Nothing matches "fox"'],
    ['shot scope: all shots is not a filter', { shotScope: { kind: 'all' } }, 'No generations yet.'],
    ['shot scope: in this shot', { shotScope: { kind: 'shot' } }, 'Nothing in this shot'],
    ['shot scope: blank name falls back', { shotScope: { kind: 'shot', name: '  ' } }, 'Nothing in this shot'],
    ['shot scope: named shot', { shotScope: { kind: 'shot', name: 'Opening' } }, 'Nothing in Opening'],
    ['shot scope: outside a shot', { shotScope: { kind: 'none' } }, 'Nothing outside a shot'],
    [
      'shot scope + type',
      { shotScope: { kind: 'shot', name: 'Opening' }, mediaType: 'image' },
      'No images in Opening',
    ],
    [
      'shot scope + search',
      { shotScope: { kind: 'none' }, searchTerm: 'fox', mediaType: 'audio' },
      'No audio match "fox" outside a shot',
    ],
  ])('%s', (_label, overrides, expected) => {
    const result = describeEmptyState({ ...BASE, ...overrides });
    expect(result.message).toBe(expected);
    expect(result.hasActiveFilters).toBe(expected === 'No generations yet.' ? false : true);
  });

  it('reports no active filters only for the unfiltered state', () => {
    expect(describeEmptyState(BASE)).toEqual({ message: 'No generations yet.', hasActiveFilters: false });
    expect(describeEmptyState({ ...BASE, starredOnly: true })).toEqual({
      message: 'Nothing starred',
      hasActiveFilters: true,
    });
  });
});
