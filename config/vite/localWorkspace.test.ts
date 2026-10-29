// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCAL_EDITOR_PORT, resolveRuntimeCommand, resolveWorkspaceDiscoveryPath } from '../../scripts/dev-local-workspace-options.mjs';

const directories: string[] = [];
function installation(profile: Record<string, unknown> = {}) {
  const dataRoot = mkdtempSync(join(tmpdir(), 'astrid-local-command-'));
  directories.push(dataRoot);
  const environment = join(dataRoot, 'program with spaces', 'py');
  const python = join(environment, 'bin', 'python');
  mkdirSync(join(environment, 'bin'), { recursive: true });
  writeFileSync(python, '');
  const directory = join(dataRoot, 'runtime', 'source-profiles');
  mkdirSync(directory, { recursive: true });
  const sourceManifest = join(directory, 'astrid.json');
  writeFileSync(sourceManifest, JSON.stringify({ profile: 'astrid', runtime_environment: environment, ...profile }));
  return { dataRoot, python, sourceManifest };
}

afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })));

describe('the supported local editor command', () => {
  it('uses a fixed editor port separate from the hosted door and existing developer stack', () => {
    expect([2222, 17340]).not.toContain(Number(LOCAL_EDITOR_PORT));
  });

  it('finds the official installation without requiring astrid-runtime on PATH', () => {
    const { dataRoot, python } = installation();
    expect(resolveRuntimeCommand({ dataRoot })).toEqual({ command: python, args: ['-m', 'astrid_runtime.cli'] });
  });

  it('keeps the workspace selected by an existing installation, including a custom data root', () => {
    const { dataRoot } = installation();
    const home = join(dataRoot, 'home');
    const programParent = join(home, '.local', 'share');
    mkdirSync(programParent, { recursive: true });
    writeFileSync(join(programParent, 'astrid-install.json'), JSON.stringify({ owner: 'haus.astrid.runtime', data_root: dataRoot }));
    expect(resolveWorkspaceDiscoveryPath({ home, platform: 'darwin', env: {} })).toBe(join(dataRoot, 'runtime', 'discovery.json'));
    expect(resolveWorkspaceDiscoveryPath({ home, platform: 'linux', env: {} })).toBe(join(dataRoot, 'runtime', 'discovery.json'));
    expect(resolveWorkspaceDiscoveryPath({ home, dataRoot: '/explicit/workspace', platform: 'darwin', env: {} })).toBe('/explicit/workspace/runtime/discovery.json');
  });

  it('reports a broken installer workspace record rather than selecting a different workspace', () => {
    const { dataRoot } = installation();
    const home = join(dataRoot, 'home');
    const programParent = join(home, '.local', 'share');
    mkdirSync(programParent, { recursive: true });
    writeFileSync(join(programParent, 'astrid-install.json'), JSON.stringify({ owner: 'haus.astrid.runtime', data_root: 'relative' }));
    expect(() => resolveWorkspaceDiscoveryPath({ home, platform: 'darwin', env: {} })).toThrow(/Invalid Astrid installation record/);
  });

  it('follows the recorded environment after an installer update', () => {
    const installed = installation();
    const replacement = installation();
    writeFileSync(installed.sourceManifest, JSON.stringify({ profile: 'astrid', runtime_environment: join(replacement.dataRoot, 'program with spaces', 'py') }));
    expect(resolveRuntimeCommand({ dataRoot: installed.dataRoot }).command).toBe(replacement.python);
  });

  it('preserves an explicit developer Python selection', () => {
    const { dataRoot } = installation({ runtime_environment: null });
    expect(resolveRuntimeCommand({ dataRoot, runtimePython: '/chosen/python' }).command).toBe('/chosen/python');
  });

  it('uses an explicitly selected profile instead of the default installation', () => {
    const { sourceManifest, python } = installation();
    expect(resolveRuntimeCommand({ dataRoot: '/unused', sourceManifest }).command).toBe(python);
  });

  it('preserves PATH for developer source profiles without a managed environment', () => {
    const { dataRoot } = installation({ runtime_environment: null });
    expect(resolveRuntimeCommand({ dataRoot })).toEqual({ command: 'astrid-runtime', args: [], cwd: undefined });
  });

  it.each([{ profile: 'owner' }, { runtime_environment: 'relative/py' }])('refuses an invalid recorded installation: %j', profile => {
    const { dataRoot } = installation(profile);
    expect(() => resolveRuntimeCommand({ dataRoot })).toThrow(/rerun the official installer/);
  });

  it('reports missing Python instead of silently starting a different Runtime', () => {
    const { dataRoot, python } = installation();
    rmSync(python);
    expect(() => resolveRuntimeCommand({ dataRoot })).toThrow(/Installed Runtime Python is missing/);
  });

  it('uses the Windows environment executable without a shell', () => {
    const { sourceManifest } = installation({ runtime_environment: 'C:\\Users\\Ada Lovelace\\Astrid\\py' });
    const python = 'C:\\Users\\Ada Lovelace\\Astrid\\py\\Scripts\\python.exe';
    expect(resolveRuntimeCommand({ sourceManifest, platform: 'win32', exists: (path: string) => path === sourceManifest || path === python }))
      .toEqual({ command: python, args: ['-m', 'astrid_runtime.cli'] });
  });
});
