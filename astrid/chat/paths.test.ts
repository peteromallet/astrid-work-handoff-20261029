import { test, expect } from 'bun:test';
import path from 'node:path';
import { isAbsolutePath, isPathWithin } from './paths.ts';

test('absolute paths use the native path implementation, including Windows drives and UNC', () => {
  for (const value of ['C:\\Users\\Alice\\Film', '\\\\computer\\share\\Film']) {
    expect(isAbsolutePath(value, path.win32)).toBe(true);
  }
  for (const value of ['C:Film', 'Film', '..\\Film']) expect(isAbsolutePath(value, path.win32)).toBe(false);
  expect(isAbsolutePath('/Users/alice/Film', path.posix)).toBe(true);
  expect(isAbsolutePath('Film', path.posix)).toBe(false);
  expect(isAbsolutePath(process.cwd())).toBe(true);
});

test('terminal paths remain inside their host root on POSIX and Windows', () => {
  for (const [paths, root, child, outside, sibling, traversal] of [
    [path.posix, '/work/film', '/work/film/scenes', '/other', '/work/film-other', '/work/film/../outside'],
    [path.win32, 'C:\\work\\film', 'C:\\work\\film\\scenes', 'D:\\work\\film', 'C:\\work\\film-other', 'C:\\work\\film\\..\\outside'],
  ] as const) {
    expect(isPathWithin(root, root, paths)).toBe(true);
    expect(isPathWithin(root, child, paths)).toBe(true);
    for (const value of [outside, sibling, traversal, 'relative']) expect(isPathWithin(root, value, paths)).toBe(false);
  }
});
