import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = process.cwd();
const targetEntries = [
  'src/tools/video-editor/core',
  'src/tools/video-editor/components/TimelineEditor/TimelineEditorCore.tsx',
  'src/tools/video-editor/components/TimelineEditorShellCore.tsx',
];

const forbiddenImports = [
  { label: 'ProjectContext', pattern: /from\s+['"]@\/shared\/contexts\/ProjectContext['"]/g },
  { label: 'ShotsContext', pattern: /from\s+['"]@\/shared\/contexts\/ShotsContext['"]/g },
  { label: 'AgentChatContext', pattern: /from\s+['"]@\/shared\/contexts\/AgentChatContext['"]/g },
  { label: 'react-router-dom', pattern: /from\s+['"]react-router-dom['"]/g },
  { label: '@/domains/media-lightbox', pattern: /from\s+['"]@\/domains\/media-lightbox(?:\/[^'"]*)?['"]/g },
];

function collectTargetFiles(entryPath: string, files: string[] = []): string[] {
  const absolutePath = path.join(rootDir, entryPath);
  if (!existsSync(absolutePath)) {
    return files;
  }

  if (statSync(absolutePath).isDirectory()) {
    for (const child of readdirSync(absolutePath, { withFileTypes: true })) {
      if (child.name.startsWith('.')) continue;
      collectTargetFiles(path.join(entryPath, child.name), files);
    }
    return files;
  }

  if (!absolutePath.endsWith('.ts') && !absolutePath.endsWith('.tsx')) {
    return files;
  }
  if (absolutePath.endsWith('.test.ts') || absolutePath.endsWith('.test.tsx')) {
    return files;
  }

  files.push(absolutePath);
  return files;
}

describe('headless video-editor core import boundary', () => {
  const files = targetEntries.flatMap((entry) => collectTargetFiles(entry));

  it('scans the headless core files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('imports no host contexts, router, or media lightbox', () => {
    const failures: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      for (const rule of forbiddenImports) {
        const count = content.match(rule.pattern)?.length ?? 0;
        if (count > 0) {
          failures.push(`${path.relative(rootDir, file)}: ${rule.label} (${count})`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
