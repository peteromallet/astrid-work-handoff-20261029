import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const forbiddenPorts = new Set([17340, 2222]);
interface N4ImportResult {
  status: string;
  realm_root: string;
  support_root: string;
  sandbox_root?: string;
  project_id: string;
  timeline_ids: string[];
  archive_bytes: number;
  receipts?: Array<Record<string, unknown>>;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the focused N4 browser flow`);
  return path.resolve(value);
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('could not reserve an ephemeral loopback port'));
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForLine(managed: { stdout: string; stderr: string; child: { exitCode: number | null } }, key: string, timeoutMs = 60_000): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const line = managed.stdout.split('\n').find((row) => row.trim().startsWith('{') && row.includes(`"${key}"`));
    if (line) return JSON.parse(line);
    if (managed.child.exitCode !== null) throw new Error(`owned N4 process exited before ${key} startup: ${managed.stderr.slice(-2000)}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for N4 process ${key} startup`);
}

async function waitForHost(managed: { stdout: string; stderr: string; child: { exitCode: number | null } }): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (managed.stdout.includes('"event": "registered"') || managed.stdout.includes('"event":"registered"')) return;
    if (managed.child.exitCode !== null) throw new Error(`N4 GenericPackHost exited before registration: ${managed.stderr.slice(-2000)}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for N4 GenericPackHost registration: ${managed.stderr.slice(-1000)}`);
}

async function stopOwnedChild(managed: { child: import('node:child_process').ChildProcess; exited: Promise<number | null>; closed: Promise<void> }): Promise<void> {
  if (managed.child.exitCode !== null || managed.child.signalCode !== null) {
    await managed.closed;
    return;
  }
  managed.child.kill('SIGTERM');
  let timer: NodeJS.Timeout | undefined;
  const timedOut = await Promise.race([
    managed.exited.then(() => false),
    new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(true), 8000); }),
  ]);
  if (timer) clearTimeout(timer);
  if (timedOut && managed.child.exitCode === null && managed.child.signalCode === null) {
    managed.child.kill('SIGKILL');
    await managed.exited;
    await managed.closed;
    throw new Error('owned N4 child required forced SIGKILL after graceful shutdown timed out');
  }
  await managed.closed;
}

function gitHead(checkout: string): string {
  return execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const appMode = process.env.N4_APP_MODE ?? 'hosted';
  if (appMode !== 'hosted' && appMode !== 'local') throw new Error('N4_APP_MODE must be hosted or local');
  const runLabel = process.env.N4_RUN_LABEL?.trim();
  if (runLabel && !/^[a-zA-Z0-9_-]{1,32}$/.test(runLabel)) throw new Error('N4_RUN_LABEL may contain only letters, numbers, underscores, and hyphens (up to 32 characters)');
  const importedResultFile = requiredEnv('N4_IMPORT_RESULT');
  const xferRoot = path.dirname(repoRoot);
  const underXfer = (candidate: string) => candidate === xferRoot || candidate.startsWith(`${xferRoot}${path.sep}`);
  if (!underXfer(importedResultFile)) throw new Error('N4 import result must be under the isolated X transfer root');
  const resultStat = lstatSync(importedResultFile);
  if (!resultStat.isFile() || resultStat.isSymbolicLink()) throw new Error('N4 import result must be a regular file under X');
  const imported = JSON.parse(readFileSync(importedResultFile, 'utf8')) as N4ImportResult;
  if (imported.status !== 'passed') throw new Error(`N4 browser requires a passed fresh sandbox import result; got ${String(imported.status)}`);
  const realmValue = String(imported.realm_root ?? '');
  const supportValue = String(imported.support_root ?? '');
  if (!realmValue || !supportValue) throw new Error('N4 import result is missing its sandbox realm/support paths');
  const realmRoot = path.resolve(realmValue);
  const supportRoot = path.resolve(supportValue);
  const sandboxRoot = path.resolve(String(imported.sandbox_root ?? path.dirname(realmRoot)));
  const sourceProjectId = imported.project_id;
  const sourceTimelineId = imported.timeline_ids?.[0] ?? '';
  const sourceArchiveBytes = Number(imported.archive_bytes ?? 0);
  if (!Number.isFinite(sourceArchiveBytes) || sourceArchiveBytes <= 0) throw new Error('N4 import result is missing the source archive byte count');
  if (!realmRoot || !supportRoot || !sourceProjectId || !sourceTimelineId || !existsSync(realmRoot) || !existsSync(supportRoot)) {
    throw new Error('N4 import result must identify an existing realm_root/support_root and passed project_id/timeline_ids[0]');
  }
  if (!path.resolve(supportRoot).startsWith(`${sandboxRoot}${path.sep}`) || !path.resolve(realmRoot).startsWith(`${sandboxRoot}${path.sep}`)) {
    throw new Error('N4 imported realm and support roots must stay inside the supplied sandbox root');
  }
  for (const candidate of [sandboxRoot, realmRoot, supportRoot]) if (!underXfer(candidate)) throw new Error('N4 imported realm and support roots must be under X, never owner data');
  const freeBytes = () => { const stat = statfsSync(sandboxRoot); return Number(stat.bavail) * Number(stat.bsize); };
  const freeBefore = freeBytes();
  const requiredFree = sourceArchiveBytes >= 1536 * 1024 ** 2 ? 8 * 1024 ** 3 : 2 * 1024 ** 3;
  if (freeBefore < requiredFree) throw new Error(`N4 browser needs ${requiredFree / 1024 ** 3} GiB free under the isolated sandbox; found ${freeBefore} bytes`);
  const astridCheckout = requiredEnv('ASTRID_CHECKOUT');
  const runtimeCheckout = requiredEnv('ASTRID_RUNTIME_CHECKOUT');
  for (const checkout of [astridCheckout, runtimeCheckout]) if (!underXfer(checkout)) throw new Error('N4 source checkouts must be the isolated X worktrees');
  const astridPython = requiredEnv('ASTRID_PYTHON');
  if (!existsSync(astridPython)) throw new Error(`N4 browser Python does not exist: ${astridPython}`);
  const pythonVersion = execFileSync(astridPython, ['-c', 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'], { encoding: 'utf8' }).trim();
  if (pythonVersion !== '3.11') throw new Error(`N4 browser requires the supplied Python 3.11 environment; got ${pythonVersion}`);
  const runtimePython = astridPython;
  const browserRoot = path.join(sandboxRoot, 'browser');
  const outputRoot = runLabel ? path.join(browserRoot, runLabel, appMode) : path.join(browserRoot, appMode);
  if (runLabel && existsSync(outputRoot)) throw new Error(`N4 browser run output already exists; choose a fresh N4_RUN_LABEL: ${outputRoot}`);
  const support = path.join(outputRoot, 'support');
  const credentials = path.join(outputRoot, 'credentials');
  const evidenceRoot = path.join(outputRoot, 'evidence');
  const downloadsRoot = path.join(outputRoot, 'downloads');
  const isolatedHome = path.join(outputRoot, 'home');
  const xdgConfig = path.join(outputRoot, 'xdg-config');
  const xdgCache = path.join(outputRoot, 'xdg-cache');
  const xdgData = path.join(outputRoot, 'xdg-data');
  const astridHome = path.join(outputRoot, 'astrid-home');
  for (const dir of [outputRoot, support, credentials, evidenceRoot, downloadsRoot, isolatedHome, astridHome, xdgConfig, xdgCache, xdgData, path.join(outputRoot, 'harness-temp')]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const descriptorFile = path.join(outputRoot, 'quick-descriptor.json');
  const auditFile = path.join(outputRoot, 'door-audit.jsonl');
  const doorCredentialFile = path.join(sandboxRoot, 'door-product.json');
  if (!existsSync(doorCredentialFile)) throw new Error(`fresh sandbox Runtime product credential is missing: ${doorCredentialFile}`);
  const doorCredential = JSON.parse(readFileSync(doorCredentialFile, 'utf8')) as { token?: string; actor_id?: string };
  if (!doorCredential.token || !doorCredential.actor_id) throw new Error('sandbox door product credential lacks a token and actor_id');

  const originPort = await freePort();
  const shortTmpRoot = mkdtempSync(path.join(realpathSync('/private/tmp'), 'an4-'));
  chmodSync(shortTmpRoot, 0o700);
  const hostedOrigin = `https://astrid.test:${originPort}`;
  const envCommon: NodeJS.ProcessEnv = {
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
    ...(process.env.NODE_OPTIONS ? { NODE_OPTIONS: process.env.NODE_OPTIONS } : {}),
    HOME: isolatedHome,
    TMPDIR: shortTmpRoot,
    TMP: shortTmpRoot,
    TEMP: shortTmpRoot,
    ASTRID_HOME: astridHome,
    XDG_CONFIG_HOME: xdgConfig,
    XDG_CACHE_HOME: xdgCache,
    XDG_DATA_HOME: xdgData,
    ASTRID_CHECKOUT: astridCheckout,
    ASTRID_PYTHON: astridPython,
    ASTRID_RUNTIME_CHECKOUT: runtimeCheckout,
    ASTRID_RUNTIME_DATA_ROOT: sandboxRoot,
    ASTRID_APP_DIRECT_ORIGIN_PORT: String(originPort),
    ASTRID_APP_DIRECT_DOOR_PORT: '',
    ASTRID_QUICK_DESCRIPTOR: descriptorFile,
    ASTRID_QUICK_TMP_ROOT: path.join(outputRoot, 'harness-temp'),
    PLAYWRIGHT_EVIDENCE_ROOT: evidenceRoot,
    PLAYWRIGHT_OUTPUT_DIR: path.join(outputRoot, 'playwright-results'),
    PLAYWRIGHT_DOWNLOADS_PATH: downloadsRoot,
    PLAYWRIGHT_USE_INSTALLED_CHROME: '1',
    PYTHONUNBUFFERED: '1',
    PYTHONDONTWRITEBYTECODE: '1',
  };
  const forbiddenAmbientKeys = Object.keys(process.env).filter((key) =>
    key.startsWith('ASTRID_LOCAL_') || key.startsWith('BANODOCO_') || key === 'ASTRID_RUNTIME_SOURCE_MANIFEST');
  for (const key of forbiddenAmbientKeys) {
    delete envCommon[key];
    delete process.env[key];
  }

  const callerTmpdir = process.env.TMPDIR;
  const callerTmp = process.env.TMP;
  const callerTemp = process.env.TEMP;
  const restoreCallerTempEnvironment = () => {
    if (callerTmpdir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = callerTmpdir;
    if (callerTmp === undefined) delete process.env.TMP;
    else process.env.TMP = callerTmp;
    if (callerTemp === undefined) delete process.env.TEMP;
    else process.env.TEMP = callerTemp;
  };

  // Set these before importing existing harness/build helpers, which derive their checkout paths from process.env.
  Object.assign(process.env, envCommon);
  delete process.env.ASTRID_APP_DIRECT_DIST;
  let spawnGroup: (typeof import('./support/harness.ts'))['spawnGroup'];
  try {
    ({ spawnGroup } = await import('./support/harness.ts'));
  } catch (error) {
    restoreCallerTempEnvironment();
    rmSync(shortTmpRoot, { recursive: true, force: true });
    throw error;
  }
  let runtimeChild: Awaited<ReturnType<typeof spawnGroup>> | undefined;
  let hostChild: Awaited<ReturnType<typeof spawnGroup>> | undefined;
  let localAppChild: Awaited<ReturnType<typeof spawnGroup>> | undefined;
  try {
    const runtimePort = 0;
    const runtime = spawnGroup(runtimePython, ['-m', 'runtime_protocol.cli', 'start', '--root', realmRoot,
      '--support-root', supportRoot, '--port', String(runtimePort), '--display-name', 'N4 Browser Acceptance',
      '--door-origin', hostedOrigin, '--door-port', '0', '--door-credential-file', doorCredentialFile,
      '--door-audit-log', auditFile], {
      cwd: runtimeCheckout,
      env: { PATH: process.env.PATH, HOME: isolatedHome, TMPDIR: shortTmpRoot, TMP: shortTmpRoot, TEMP: shortTmpRoot,
        ASTRID_HOME: astridHome, XDG_CONFIG_HOME: xdgConfig, XDG_CACHE_HOME: xdgCache, XDG_DATA_HOME: xdgData,
        PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1',
        ASTRID_PYTHON: runtimePython, ASTRID_RUNTIME_CHECKOUT: runtimeCheckout, ASTRID_RUNTIME_DATA_ROOT: sandboxRoot },
      exactEnv: true,
    });
    runtimeChild = runtime;
    const started = await waitForLine(runtime, 'endpoint');
    const discoveryFile = path.join(supportRoot, 'discovery.json');
    const discovery = JSON.parse(readFileSync(discoveryFile, 'utf8')) as Record<string, string>;
    const endpoint = String(started.endpoint ?? '');
    const doorEndpoint = String(started.door_endpoint ?? '');
    const runtimeInstanceId = String(discovery.runtime_instance_id ?? '');
    const realmId = String(discovery.active_realm ?? '');
    const runtimePortActual = Number(new URL(endpoint).port);
    const doorPort = Number(new URL(doorEndpoint).port);
    if (!endpoint || !doorEndpoint || !runtimeInstanceId || !realmId || !runtimePortActual || !doorPort) throw new Error('N4 sandbox Runtime startup omitted its dynamic endpoints or identity');
    if ([runtimePortActual, doorPort, originPort].some((port) => forbiddenPorts.has(port))) throw new Error('N4 allocated a forbidden default port (17340 or 2222)');
    if (discovery.realm_id && discovery.realm_id !== realmId) throw new Error('Runtime discovery realm identity disagrees with its startup output');
    const workerCredentialFile = String(discovery.worker_credential_file ?? started.worker_credential_file ?? '');
    if (!workerCredentialFile || !existsSync(workerCredentialFile)) throw new Error('N4 sandbox Runtime did not publish its worker credential');

    // The product-facing hosted UI obtains export-plan work from the canonical timeline pack host.
    // Same composition the supervised host bootstrap uses (astrid/sdk/host_bootstrap.py): stamp <support>/astrid-host/boot-manifest.json.
    const bootManifestPath = path.join(supportRoot, 'astrid-host', 'boot-manifest.json');
    execFileSync(astridPython, ['-c',
      'import sys; from astrid.core.gateway.dispatch import compose_profile_handoff; compose_profile_handoff(sys.argv[1], support_root=sys.argv[2])',
      bootManifestPath, supportRoot], {
      cwd: astridCheckout,
      env: { PATH: process.env.PATH, HOME: isolatedHome, TMPDIR: shortTmpRoot, TMP: shortTmpRoot, TEMP: shortTmpRoot,
        PYTHONDONTWRITEBYTECODE: '1', PYTHONPATH: `${astridCheckout}${path.delimiter}${runtimeCheckout}` },
      stdio: 'inherit',
    });
    hostChild = spawnGroup(astridPython, ['-m', 'astrid.core.execution.generic_host', 'run',
      '--pack-root', path.join(astridCheckout, 'astrid', 'packs'), // the whole first-party root, so the capability-approval matrix applies as in production
      '--runtime-endpoint', endpoint, '--credential-file', workerCredentialFile,
      '--executor-id', 'astrid-pack-host', '--runtime-discovery-file', discoveryFile,
      '--source-checkout', astridCheckout, '--support-root', supportRoot, '--boot-manifest-path', bootManifestPath,
      '--runtime-instance-id', runtimeInstanceId, '--attempt-root', path.join(outputRoot, 'attempts'),
      '--register', '--poll-seconds', '0.5'], {
      cwd: astridCheckout,
      env: { PATH: process.env.PATH, HOME: isolatedHome, TMPDIR: shortTmpRoot, TMP: shortTmpRoot, TEMP: shortTmpRoot,
        ASTRID_HOME: astridHome, XDG_CONFIG_HOME: xdgConfig, XDG_CACHE_HOME: xdgCache, XDG_DATA_HOME: xdgData,
        PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1',
        ASTRID_PYTHON: astridPython, PYTHONPATH: `${astridCheckout}${path.delimiter}${runtimeCheckout}`, ASTRID_RUNTIME_DATA_ROOT: sandboxRoot,
        ASTRID_RUNTIME_CHECKOUT: runtimeCheckout },
      exactEnv: true,
    });
    await waitForHost(hostChild);

    const product = await fetch(`${endpoint}/v1/projects`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${doorCredential.token}`, 'Content-Type': 'application/json', 'Idempotency-Key': `n4-browser-${originPort}` },
      body: JSON.stringify({ name: `N4 Browser Import ${originPort}` }),
    });
    const projectEnvelope = await product.json() as any;
    if (product.status !== 201) throw new Error(`could not create the N4 UI import target through the sandbox Runtime product credential: ${product.status} ${JSON.stringify(projectEnvelope)}`);
    const project = projectEnvelope.data ?? projectEnvelope;
    const transferProjectId = String(project.project_id ?? project.id ?? '');
    const transferProjectName = String(project.name ?? '');
    if (!transferProjectId || !transferProjectName) throw new Error('sandbox Runtime did not return the expected empty transfer project resource');
    const verifyProject = await fetch(`${endpoint}/v1/projects/${encodeURIComponent(transferProjectId)}`, { headers: { Authorization: `Bearer ${doorCredential.token}` } });
    const verifiedProject = await verifyProject.json() as any;
    const verifiedResource = verifiedProject.data ?? verifiedProject;
    if (!verifyProject.ok || verifiedResource.project_id !== transferProjectId || verifiedResource.realm_id !== realmId || verifiedResource.name !== transferProjectName) {
      throw new Error('fresh UI import target project does not belong to the imported Runtime realm');
    }

    const sourceManifest = path.join(support, 'source-manifest.json');
    writeFileSync(sourceManifest, `${JSON.stringify({ kind: 'n4-browser-sandbox', import_result: importedResultFile }, null, 2)}\n`, { mode: 0o600 });
    const projectResponse = await fetch(`${endpoint}/v1/projects/${encodeURIComponent(sourceProjectId)}`, { headers: { Authorization: `Bearer ${doorCredential.token}` } });
    if (!projectResponse.ok) throw new Error(`source project lookup failed with ${projectResponse.status}`);
    const sourceProject = await projectResponse.json() as any;
    const projectResource = sourceProject.data ?? sourceProject;
    const headResponse = await fetch(`${endpoint}/v1/projects/${encodeURIComponent(sourceProjectId)}/timelines/${encodeURIComponent(sourceTimelineId)}/composition-revisions?limit=1`, { headers: { Authorization: `Bearer ${doorCredential.token}` } });
    if (!headResponse.ok) throw new Error(`source timeline head lookup failed with ${headResponse.status}`);
    const headEnvelope = await headResponse.json() as any;
    const head = (headEnvelope.data ?? headEnvelope).items?.find((row: any) => row.is_current_head)?.revision_id;
    if (typeof head !== 'string' || !head) throw new Error('N4 imported timeline has no current head revision');
    const descriptor = {
      version: 1,
      dataRoot: sandboxRoot,
      sourceManifest,
      discoveryFile,
      hostedOrigin,
      doorEndpoint,
      productCredentialFile: doorCredentialFile,
      // The browser acceptance never invokes the Astrid CLI; this path is the sandbox's actual scoped product credential.
      astridCredentialFile: doorCredentialFile,
      projectId: sourceProjectId,
      projectSlug: String(projectResource.slug ?? ''),
      timelineId: sourceTimelineId,
      headRevisionId: head,
      realmId,
      runtimeInstanceId,
      shortTmpDir: shortTmpRoot,
      sourceArchiveBytes,
      freeBytesBefore: freeBefore,
      revisions: { astrid: gitHead(astridCheckout), runtime: gitHead(runtimeCheckout), app: gitHead(repoRoot) },
      resultFile: importedResultFile,
      transferProjectId,
      transferProjectName,
    };
    if (!descriptor.projectSlug) throw new Error('N4 imported source project has no slug');
    writeFileSync(descriptorFile, `${JSON.stringify(descriptor, null, 2)}\n`, { mode: 0o600 });
    chmodSync(descriptorFile, 0o600);
    process.env.ASTRID_APP_DIRECT_DOOR_PORT = String(doorPort);
    process.env.N4_APP_MODE = appMode;
    process.env.N4_IMPORT_RESULT = importedResultFile;
    const directBuild = await import('./global-setup.ts');
    await directBuild.default();
    if (!directBuild.distIsHosted()) throw new Error('N4 production build does not target the verified dynamic sandbox door origin');

    if (appMode === 'local') {
      const localPort = await freePort();
      if (forbiddenPorts.has(localPort)) throw new Error('N4 local app received a forbidden port');
      const appTokenFile = path.join(credentials, 'runtime-product.json');
      writeFileSync(appTokenFile, JSON.stringify({ token: doorCredential.token }), { mode: 0o600 });
      const viteEnv: NodeJS.ProcessEnv = {
        ...envCommon,
        PORT: String(localPort),
        WORKSPACE_RUNTIME_TOKEN_FILE: appTokenFile,
        VITE_WORKSPACE_RUNTIME_URL: endpoint,
        VITE_WORKSPACE_RUNTIME_EXPECTED_ACTOR_ID: doorCredential.actor_id,
        VITE_WORKSPACE_RUNTIME_EXPECTED_REALM_ID: realmId,
        VITE_WORKSPACE_RUNTIME_EXPECTED_INSTANCE_ID: runtimeInstanceId,
        VITE_ASTRID_BRIDGE_PORT: String(runtimePortActual),
        ASTRID_BRIDGE_TOKEN: doorCredential.token,
        VITE_ASTRID_ACP_BRIDGE_PORT: String(runtimePortActual),
        ASTRID_ACP_BRIDGE_TOKEN: doorCredential.token,
      };
      localAppChild = spawnGroup(process.execPath, [path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'), '--config', 'config/vite/vite.config.ts', '--host', '127.0.0.1', '--port', String(localPort), '--strictPort'], {
        cwd: repoRoot, env: viteEnv, exactEnv: true,
      });
      const deadline = Date.now() + 120_000;
      const localOrigin = `http://127.0.0.1:${localPort}`;
      let ready = false;
      while (Date.now() < deadline) {
        try { if ((await fetch(localOrigin)).ok) { ready = true; break; } } catch { /* wait for Vite's listener */ }
        if (localAppChild.child.exitCode !== null) throw new Error(`N4 local Vite exited: ${localAppChild.stderr.slice(-2000)}`);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (!ready) throw new Error(`N4 local Vite did not become ready at ${localOrigin}`);
      process.env.N4_LOCAL_APP_ORIGIN = localOrigin;
    }

    return async () => {
      const errors: unknown[] = [];
      if (localAppChild) writeFileSync(path.join(outputRoot, 'vite-local.log'), `--- stdout\n${localAppChild.stdout}\n--- stderr\n${localAppChild.stderr}\n`, { mode: 0o600 });
      for (const child of [localAppChild, hostChild, runtimeChild]) {
        if (child) await stopOwnedChild(child).catch((error) => errors.push(error));
      }
      restoreCallerTempEnvironment();
      if (!errors.length) {
        try { rmSync(shortTmpRoot, { recursive: true }); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, 'N4 owned browser fixture processes did not stop cleanly');
    };
  } catch (error) {
    const stopErrors: unknown[] = [];
    for (const child of [localAppChild, hostChild, runtimeChild]) {
      if (child) await stopOwnedChild(child).catch((stopError) => stopErrors.push(stopError));
    }
    restoreCallerTempEnvironment();
    if (!stopErrors.length) rmSync(shortTmpRoot, { recursive: true, force: true });
    throw error;
  }
}
