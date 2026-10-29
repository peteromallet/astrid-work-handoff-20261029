import path from 'node:path';

type PathApi = Pick<typeof path, 'isAbsolute' | 'relative'>;

export function isAbsolutePath(value: string, paths: PathApi = path): boolean {
  return paths.isAbsolute(value);
}

export function isPathWithin(root: string, candidate: string, paths: PathApi = path): boolean {
  if (!paths.isAbsolute(candidate)) return false;
  const child = paths.relative(root, candidate);
  return child === '' || (!paths.isAbsolute(child) && child !== '..' && !/^\.\.[/\\]/.test(child));
}
