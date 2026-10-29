import { describe, expect, it, vi } from 'vitest';

import {
  AstridCapabilityBindingError,
  AstridLocalCatalogRoutes,
} from './catalogRoutes';
import type { AstridBridgeTransport } from './transport';
import type { RuntimeCapability } from '@/tools/video-editor/data/bridgeContract';

function capability(overrides: Partial<RuntimeCapability> = {}): RuntimeCapability {
  return {
    capability_id: 'astrid.image_generation',
    definition_digest: `sha256:${'a'.repeat(64)}`,
    status: 'ready',
    required_resource_keys: [],
    estimated_scratch_bytes: 0,
    estimated_output_bytes: 0,
    ...overrides,
  };
}

function catalog(pages: Array<{ items: RuntimeCapability[]; next_cursor: string | null }>) {
  let pageIndex = 0;
  const requestJson = vi.fn(async () => pages[Math.min(pageIndex++, pages.length - 1)]);
  return {
    routes: new AstridLocalCatalogRoutes({ requestJson } as unknown as AstridBridgeTransport),
    requestJson,
  };
}

describe('Astrid capability catalog binding', () => {
  it('includes the unavailable reason when rejecting a non-ready capability', async () => {
    const { routes, requestJson } = catalog([{
      items: [capability({ status: 'unavailable', unavailable_reason: 'model_missing' })],
      next_cursor: null,
    }]);

    await expect(routes.get('astrid.image_generation'))
      .rejects.toHaveProperty('message', 'capability is not ready: astrid.image_generation (unavailable): model_missing');
    expect(requestJson).toHaveBeenCalledTimes(1);
  });

  it('includes the missing renderer install and its fix in the render admission error', async () => {
    const reason = 'remotion:reason=Remotion node_modules is missing: /checkout/remotion/node_modules; '
      + 'run `npm ci` in /checkout/remotion with Node v20.19.4 on PATH';
    const { routes } = catalog([{
      items: [capability({ capability_id: 'rendering.render', status: 'unavailable', unavailable_reason: reason })],
      next_cursor: null,
    }]);

    await expect(routes.get('rendering.render'))
      .rejects.toHaveProperty('message', `capability is not ready: rendering.render (unavailable): ${reason}`);
  });

  it.each([undefined, null, ''])(
    'preserves the existing message when unavailable_reason is %s',
    async (unavailable_reason) => {
      const { routes } = catalog([{
        items: [capability({ status: 'unavailable', unavailable_reason })],
        next_cursor: null,
      }]);

      await expect(routes.get('astrid.image_generation'))
        .rejects.toHaveProperty('message', 'capability is not ready: astrid.image_generation (unavailable)');
    },
  );

  it('rejects duplicate capability IDs across catalog pages', async () => {
    const first = capability();
    const { routes, requestJson } = catalog([
      { items: [first], next_cursor: 'page-2' },
      { items: [first], next_cursor: null },
    ]);

    await expect(routes.get(first.capability_id))
      .rejects.toThrow('duplicate ID');
    expect(requestJson).toHaveBeenCalledTimes(2);
  });

  it('rejects a catalog cursor cycle before returning a capability', async () => {
    const { routes, requestJson } = catalog([
      { items: [capability()], next_cursor: 'page-2' },
      { items: [], next_cursor: 'page-2' },
    ]);

    const error = await routes.get('missing.capability').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(AstridCapabilityBindingError);
    expect(error).toMatchObject({ message: 'capability catalog cursor cycle detected' });
    expect(requestJson).toHaveBeenCalledTimes(2);
  });
});
