import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../astrid/chat/service.mjs', import.meta.url));
const result = await Bun.build({
  entrypoints: [fileURLToPath(new URL('../astrid/chat/service.ts', import.meta.url))],
  target: 'bun',
  format: 'esm',
  minify: true,
  packages: 'bundle',
});
if (!result.success) throw new AggregateError(result.logs, 'Chat bundle failed');
const bytes = new Uint8Array(await result.outputs[0].arrayBuffer());
if (process.argv.includes('--check')) {
  if (!Buffer.from(bytes).equals(readFileSync(output))) throw new Error('Chat bundle is stale; run bun run build:chat');
} else {
  writeFileSync(output, bytes);
}
