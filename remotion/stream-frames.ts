import path from 'node:path';
import {createRequire} from 'node:module';

// The host supplies an admitted allocation. Physical/free machine memory is
// deliberately irrelevant; disk fallback remains fully reserved at admission.
export const STREAM_FRAMES_ENV = 'ASTRID_REMOTION_STREAM_FRAMES';
export const STREAM_MEMORY_BUDGET_ENV = 'ASTRID_REMOTION_STREAM_MEMORY_BUDGET_BYTES';
export const streamingDecision = ({width, height, admittedMemoryBytes}: {
  width: number; height: number; admittedMemoryBytes: number;
}) => {
  const estimatedUsage = width * height * 1000;
  const valid = [width, height, admittedMemoryBytes].every(Number.isSafeInteger)
    && width > 0 && height > 0 && admittedMemoryBytes >= 0;
  return {hasEnoughMemory: valid && estimatedUsage + 2 * 1024 ** 3 <= admittedMemoryBytes,
    freeMemory: valid ? admittedMemoryBytes : 0, estimatedUsage};
};
export const installFrameStreaming = ({rendererEntry, admittedMemoryBytes, load}: {
  rendererEntry: string; admittedMemoryBytes: number; load: (id: string) => unknown;
}) => {
  if (!Number.isSafeInteger(admittedMemoryBytes) || admittedMemoryBytes < 0) {
    throw new Error('Astrid frame streaming requires a non-negative owner-admitted memory allocation');
  }
  const target = path.join(path.dirname(rendererEntry), 'prestitcher-memory-usage.js');
  const gate = load(target) as {shouldUseParallelEncoding?: unknown};
  if (typeof gate?.shouldUseParallelEncoding !== 'function') {
    throw new Error(`Astrid frame streaming: ${target} has no supported memory gate; update the pinned renderer adapter`);
  }
  gate.shouldUseParallelEncoding = ({width, height}: {width: number; height: number}) =>
    streamingDecision({width, height, admittedMemoryBytes});
};
export const installAdmittedFrameStreaming = ({remotionRoot}: {remotionRoot: string}) => {
  if (process.env[STREAM_FRAMES_ENV] !== '1') return;
  if (typeof remotionRoot !== 'string' || !path.isAbsolute(remotionRoot)) {
    throw new Error('Astrid frame streaming requires an explicit absolute remotionRoot');
  }
  const require = createRequire(path.join(remotionRoot, 'package.json'));
  installFrameStreaming({rendererEntry: require.resolve('@remotion/renderer'),
    admittedMemoryBytes: Number(process.env[STREAM_MEMORY_BUDGET_ENV] ?? 0), load: require});
};
