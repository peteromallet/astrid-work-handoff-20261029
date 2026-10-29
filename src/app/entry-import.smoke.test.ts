/**
 * The process runtime used to be reachable from the browser entry through the
 * video editor. Keep its modules safe to evaluate in a DOM runtime without
 * importing the entire App graph; `moduleImportCoverage.test.ts` covers App
 * and routes separately.
 */
import { describe, expect, it } from 'vitest';

describe('browser process runtime imports', () => {
  it('evaluates the process manager and its stdio transport without Node runtime access', async () => {
    const [manager, transport] = await Promise.all([
      import('@/tools/video-editor/runtime/processes/ProcessManager'),
      import('@/tools/video-editor/runtime/processes/jsonRpcStdioTransport'),
    ]);

    expect(typeof manager.createProcessManager).toBe('function');
    expect(typeof transport.createJsonRpcStdioTransport).toBe('function');
  });
});
