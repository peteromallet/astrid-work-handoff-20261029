#!/usr/bin/env node
// Reuse the editor launcher and its process cleanup, with setup enabled by default.
process.env.ASTRID_FAKE_AGENT_SCENARIO ??= 'A';
console.log(`Agent setup scenario: ${process.env.ASTRID_FAKE_AGENT_SCENARIO} (A–G)`);
await import('./dev-editor.mjs');
