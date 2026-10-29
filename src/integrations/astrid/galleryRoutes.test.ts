import { describe, expect, it, vi } from 'vitest';

vi.mock('./runtimeReadModels.ts', () => ({
  runtimeGenerationToSummary: (generation: Record<string, unknown>) => ({
    id: generation.generation_id,
    generation_id: generation.generation_id,
    updated_at: generation.updated_at,
  }),
  runtimeGenerationToDetail: vi.fn(),
}));

import { AstridLocalGalleryRoutes, GALLERY_VARIANT_CONCURRENCY } from './galleryRoutes.ts';

describe('gallery list variant loading', () => {
  it('loads one variants page per generation with bounded concurrency', async () => {
    const GENERATIONS = 60;
    let inFlight = 0;
    let peak = 0;
    const variantCalls: string[] = [];
    const transport = {
      requestJson: vi.fn(async (path: string) => {
        if (path.includes('/variants')) {
          variantCalls.push(path);
          inFlight++; peak = Math.max(peak, inFlight);
          await Promise.resolve(); await Promise.resolve();
          inFlight--;
          return { items: [], next_cursor: null };
        }
        return {
          items: Array.from({ length: GENERATIONS }, (_, i) => ({ generation_id: `g${i}` })),
          next_cursor: null,
        };
      }),
    };
    const routes = new AstridLocalGalleryRoutes(transport as never, { projectSlug: 'p' });
    const page = await routes.list({ limit: 200 });
    expect(page.generations).toHaveLength(GENERATIONS);
    expect(variantCalls).toHaveLength(GENERATIONS);
    // Before the fix all 60 were issued at once.
    expect(peak).toBeLessThanOrEqual(GALLERY_VARIANT_CONCURRENCY);
  });

  it('supports generation discovery without fetching variant pages', async () => {
    const variantCalls: string[] = [];
    const transport = {
      requestJson: vi.fn(async (path: string) => {
        if (path.includes('/variants')) {
          variantCalls.push(path);
          return { items: [], next_cursor: null };
        }
        return {
          items: [{
            generation_id: 'g1', project_id: 'p', source_task_id: null,
            type: 'image', status: 'succeeded', metadata: {}, version: 2,
            created_at: '2026-10-16T11:00:00.000Z', updated_at: '2026-10-16T12:00:00.000Z',
          }],
          next_cursor: null,
        };
      }),
    };
    const routes = new AstridLocalGalleryRoutes(transport as never, { projectSlug: 'p' });

    const page = await routes.list({ limit: 200, includeVariants: false });

    expect(page.generations).toHaveLength(1);
    expect(page.generations[0]).toMatchObject({ generation_id: 'g1', updated_at: '2026-10-16T12:00:00.000Z' });
    expect(variantCalls).toHaveLength(0);
  });
});
