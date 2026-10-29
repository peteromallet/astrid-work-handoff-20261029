import { build } from 'vite';
import { resolveHostedRuntimeOrigin } from './hosted-build-origin.mjs';

process.env.VITE_RUNTIME_ORIGIN = resolveHostedRuntimeOrigin();
process.env.VITE_WORKSPACE_RUNTIME_EXPECTED_ACTOR_ID = '';
process.env.VITE_WORKSPACE_RUNTIME_EXPECTED_REALM_ID = '';
process.env.VITE_WORKSPACE_RUNTIME_EXPECTED_INSTANCE_ID = '';

await build({ configFile: 'config/vite/vite.config.ts' });
