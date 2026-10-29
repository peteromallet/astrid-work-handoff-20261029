import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { packageManagerInvocation } from './node-package-manager.mjs';

const [command, ...forwarded] = process.argv.slice(2);
export function resolveDeveloperCommand(command, forwarded, parentEnv = process.env) {
  const env = { ...parentEnv };

  // `timeline` runs the bundled-Chromium device project; `timeline-chrome-export` runs only the
  // installed-Chrome H.264 project. Same env for both; the second never adds `timeline-devices`.
  const timelineProject = { timeline: 'timeline-devices', 'timeline-chrome-export': 'timeline-chrome-export' }[command];
  if (timelineProject) {
    env.PLAYWRIGHT_TIMELINE_DEVICES = '1';
    env.PLAYWRIGHT_PORT = env.PLAYWRIGHT_PORT || '';
    env.FAKE_RUNTIME_PORT = env.FAKE_RUNTIME_PORT || '';
    const invocation = packageManagerInvocation('npx', [
      'playwright', 'test', '--config', 'playwright.config.ts', `--project=${timelineProject}`, '--workers=1',
      ...forwarded,
    ], { env });
    return { invocation, env };
  }
  if (command === 'checkout') {
    env.VITEST_LANE = 'checkout';
    const invocation = packageManagerInvocation('npx', ['vitest', 'run', '--config', 'config/testing/vitest.config.ts', ...forwarded], { env });
    return { invocation, env };
  }
  if (command === 'acceptance-matrix') {
    env.ASTRID_APP_ACCEPTANCE_MATRIX = '1';
    return { invocation: { command: process.execPath, args: ['scripts/acceptance/verify-local-project-gallery.mjs', ...forwarded] }, env };
  }
  throw new Error(`Unknown developer command: ${command}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { invocation, env } = resolveDeveloperCommand(command, forwarded);
  const child = spawn(invocation.command, invocation.args, { stdio: 'inherit', env });
  child.once('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.once('close', (code, signal) => {
    process.exitCode = signal ? 1 : (code ?? 1);
  });
}
