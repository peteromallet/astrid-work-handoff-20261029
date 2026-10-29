import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { TestInfo } from '@playwright/test';

/** Keeps N4 browser captures in the fresh sandbox root, without loading unrelated fake-runtime timeline fixtures. */
export function browserEvidencePath(testInfo: TestInfo, relativePath: string): string {
  const root = process.env.PLAYWRIGHT_EVIDENCE_ROOT;
  const destination = root ? path.resolve(root, relativePath) : testInfo.outputPath(relativePath);
  if (root && destination !== path.resolve(root) && !destination.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new Error('N4 evidence path escaped the isolated browser evidence root');
  }
  mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  return destination;
}
