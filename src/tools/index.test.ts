import { describe, expect, it } from 'vitest';
import { toolsManifest, toolsUIManifest } from './index';

describe('tools manifest contracts', () => {
  it('keeps tool ids unique in the core manifest', () => {
    const ids = toolsManifest.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps UI manifest ids unique and paths tool-scoped', () => {
    const ids = toolsUIManifest.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(toolsUIManifest.every((tool) => tool.path.startsWith('/tools/'))).toBe(true);
  });

  it('uses ids that exist in the core manifest', () => {
    const manifestIds = new Set(toolsManifest.map((tool) => tool.id));
    expect(toolsUIManifest.every((tool) => manifestIds.has(tool.id))).toBe(true);
  });

});
