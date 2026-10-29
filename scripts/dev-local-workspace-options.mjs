import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, win32 } from 'node:path';
import { parseEnv } from 'node:util';

const VITE_ENTRY_RE = /^index-[A-Za-z0-9_-]+\.js$/;
export const LOCAL_EDITOR_PORT = '5180';

export const LOCAL_RUNTIME_ENV_KEYS = Object.freeze([
  'ASTRID_RUNTIME_DATA_ROOT', 'ASTRID_SUPPORT_ROOT', 'ASTRID_WORKSPACE_DISCOVERY',
  'ASTRID_RUNTIME_CHECKOUT', 'ASTRID_RUNTIME_PYTHON', 'ASTRID_RUNTIME_SOURCE_MANIFEST',
  'ASTRID_CHECKOUT', 'ASTRID_APP_ACP_ENABLED', 'ASTRID_ENV_FILE', 'ASTRID_PACK_HOST_PYTHON',
]);

/** Persist the installation selection in the existing ignored Vite local env file.
 * Only launcher settings are loaded; unrelated app/port/secrets remain Vite's concern.
 * Explicit shell values (including empty values) and command-line arguments win.
 */
export function loadLocalRuntimeEnvironment(cwd, env) {
  const path = join(cwd, '.env.local');
  if (!existsSync(path)) return;
  const local = parseEnv(readFileSync(path, 'utf8'));
  for (const key of LOCAL_RUNTIME_ENV_KEYS) {
    if (!Object.hasOwn(env, key) && Object.hasOwn(local, key)) env[key] = local[key];
  }
}

export function parseDevLocalWorkspaceArgs(args, env = {}) {
  let preview = false;
  let previewDir = null;
  let checkOnly = false;
  let paired = false;
  let resetPairing = false;
  let acp = env.ASTRID_APP_ACP_ENABLED === '1';
  const runtimeOptions = {};
  const valueOptions = new Map([
    ['--data-root', 'dataRoot'],
    ['--runtime', 'runtimeCheckout'],
    ['--astrid', 'astridCheckout'],
    ['--source-manifest', 'sourceManifest'],
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--check') {
      checkOnly = true;
      continue;
    }
    if (argument === '--paired') {
      paired = true;
      continue;
    }
    if (argument === '--reset-pairing') {
      resetPairing = true;
      continue;
    }
    if (argument === '--acp') {
      acp = true;
      continue;
    }
    if (argument === '--preview') {
      preview = true;
      continue;
    }
    if (argument === '--preview-dir') {
      if (previewDir !== null) {
        throw new Error('--preview-dir may be provided only once');
      }
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--preview-dir requires an absolute emitted output directory');
      }
      previewDir = value;
      index += 1;
      continue;
    }
    const optionName = valueOptions.get(argument);
    if (optionName) {
      if (Object.hasOwn(runtimeOptions, optionName)) {
        throw new Error(`${argument} may be provided only once`);
      }
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a path`);
      }
      runtimeOptions[optionName] = value;
      index += 1;
      continue;
    }
    // Preserve the launcher's historical behavior for unrelated arguments;
    // npm/Vite-owned options are not interpreted by this wrapper.
  }

  if (preview !== (previewDir !== null)) {
    throw new Error('--preview requires --preview-dir <absolute emitted output directory>');
  }

  return Object.freeze({
    checkOnly,
    paired,
    resetPairing,
    acp,
    preview,
    previewDir,
    ...runtimeOptions,
  });
}

/** Resolve the Runtime CLI invocation without a shell, preserving explicit Python selection. */
export function resolveRuntimeCommand({ runtimeCheckout, runtimePython, astridCheckout, dataRoot, sourceManifest, platform = process.platform, exists = existsSync } = {}) {
  const checkout = runtimeCheckout?.trim();
  const python = runtimePython?.trim();
  if (python) {
    return {
      command: python,
      args: ['-m', 'astrid_runtime.cli'],
      ...(checkout ? { cwd: checkout } : {}),
    };
  }
  if (checkout) {
    const path = platform === 'win32' ? win32 : undefined;
    const scriptsDirectory = platform === 'win32' ? 'Scripts' : 'bin';
    const executable = platform === 'win32' ? 'python.exe' : 'python';
    const venvPython = (root) => (path?.join ?? join)(root, '.venv', scriptsDirectory, executable);
    // An installation shares one environment between agent and Runtime, so the
    // selected Astrid checkout's venv also holds the generated Runtime client.
    const astridPython = astridCheckout?.trim() ? venvPython(astridCheckout.trim()) : null;
    if (astridPython && exists(astridPython)) {
      return { command: astridPython, args: ['-m', 'astrid_runtime.cli'], cwd: checkout };
    }
    const checkoutPython = venvPython(checkout);
    if (!exists(checkoutPython)) {
      throw new Error(`Runtime checkout has no .venv/${scriptsDirectory}/${executable}: ${checkoutPython}; set ASTRID_RUNTIME_PYTHON to an explicit Python executable`);
    }
    return { command: checkoutPython, args: ['-m', 'astrid_runtime.cli'], cwd: checkout };
  }
  // The official installer keeps Python off PATH and records it in the Runtime's source profile.
  const paths = platform === 'win32' ? win32 : { join, isAbsolute };
  const profilePath = sourceManifest || (dataRoot && paths.join(dataRoot, 'runtime', 'source-profiles', 'astrid.json'));
  if (profilePath && exists(profilePath)) {
    const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
    const environment = profile.runtime_environment;
    if (profile.profile !== 'astrid' || (environment != null
      && (typeof environment !== 'string' || !paths.isAbsolute(environment)))) {
      throw new Error(`Runtime source profile has no absolute Astrid Python environment: ${profilePath}; rerun the official installer to repair it`);
    }
    if (environment != null) {
      const installedPython = paths.join(environment, platform === 'win32' ? 'Scripts' : 'bin', platform === 'win32' ? 'python.exe' : 'python');
      if (!exists(installedPython)) throw new Error(`Installed Runtime Python is missing: ${installedPython}; rerun the official installer to repair it`);
      return { command: installedPython, args: ['-m', 'astrid_runtime.cli'] };
    }
  }
  return { command: 'astrid-runtime', args: [], cwd: undefined };
}

/**
 * Resolve only an explicitly selected, already-emitted Vite output.
 * Requiring the index and hashed entry prevents silently serving a source tree
 * or an arbitrary directory when preview mode is requested.
 */
export function validatePreviewOutputDirectory(value) {
  if (!isAbsolute(value)) {
    throw new Error('--preview-dir must be an absolute path');
  }

  let outputDirectory;
  try {
    outputDirectory = realpathSync(value);
  } catch {
    throw new Error(`--preview-dir does not exist: ${value}`);
  }
  try {
    if (!statSync(outputDirectory).isDirectory()) {
      throw new Error(`--preview-dir is not a directory: ${value}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('--preview-dir is not a directory:')) {
      throw error;
    }
    throw new Error(`--preview-dir does not exist: ${value}`);
  }

  const indexPath = join(outputDirectory, 'index.html');
  const assetsDirectory = join(outputDirectory, 'assets');
  if (!existsSync(indexPath) || !statSync(indexPath).isFile()) {
    throw new Error(`--preview-dir is not an emitted Vite output (missing index.html): ${value}`);
  }
  let assetsAreDirectory = false;
  try {
    assetsAreDirectory = statSync(assetsDirectory).isDirectory();
  } catch {
    assetsAreDirectory = false;
  }
  if (!assetsAreDirectory) {
    throw new Error(`--preview-dir is not an emitted Vite output (missing assets/): ${value}`);
  }
  let entry;
  try {
    entry = readdirSync(assetsDirectory).find((name) => VITE_ENTRY_RE.test(name));
  } catch {
    throw new Error(`--preview-dir is not an emitted Vite output (unreadable assets/): ${value}`);
  }
  if (!entry || !statSync(join(assetsDirectory, entry)).isFile()) {
    throw new Error(`--preview-dir is not an emitted Vite output (missing assets/index-*.js): ${value}`);
  }

  return outputDirectory;
}

/**
 * Arguments for the Vite child. `quiet` (the default launch: no `--verbose`) silences npm's banner and Vite's startup
 * block; the launcher says what a person needs to know itself.
 */
export function viteChildArgs(options) {
  const quiet = options.quiet === true;
  const npm = quiet ? ['--silent'] : [];
  const logging = quiet ? ['--logLevel', 'warn'] : [];
  if (options.preview) {
    return [
      ...npm,
      'run',
      'preview',
      '--',
      '--host',
      '127.0.0.1',
      '--strictPort',
      '--outDir',
      options.previewDir,
      ...logging,
    ];
  }
  return [...npm, 'run', 'dev', '--', '--host', '127.0.0.1', '--strictPort', ...logging];
}

/** Runtime selection is independent of an Astrid source checkout. */
export function resolveRuntimeDataRoot({ platform = process.platform, env = process.env, home }) {
  const path = platform === 'win32' ? win32 : undefined;
  const pathJoin = path?.join ?? join;
  const programParent = platform === 'win32'
    ? env.LOCALAPPDATA || pathJoin(home, 'AppData', 'Local')
    : platform === 'linux' ? env.XDG_DATA_HOME || pathJoin(home, '.local', 'share') : pathJoin(home, '.local', 'share');
  const selection = pathJoin(programParent, 'astrid-install.json');
  if (existsSync(selection)) {
    const installed = JSON.parse(readFileSync(selection, 'utf8'));
    if (installed.owner !== 'haus.astrid.runtime' || typeof installed.data_root !== 'string'
      || !(path?.isAbsolute ?? isAbsolute)(installed.data_root)) {
      throw new Error(`Invalid Astrid installation record: ${selection}; rerun the official installer to repair it`);
    }
    return installed.data_root;
  }
  if (platform === 'win32') return pathJoin(env.LOCALAPPDATA || pathJoin(home, 'AppData', 'Local'), 'Astrid Runtime');
  if (platform === 'darwin') return pathJoin(home, 'Library', 'Application Support', 'Astrid Runtime');
  return pathJoin(env.XDG_DATA_HOME || pathJoin(home, '.local', 'share'), 'astrid-runtime');
}

export function resolveWorkspaceDiscoveryPath({ discovery, supportRoot, dataRoot, home, platform = process.platform, env = process.env }) {
  const path = platform === 'win32' ? win32 : undefined;
  const pathIsAbsolute = path?.isAbsolute ?? isAbsolute;
  const selected = discovery?.trim();
  if (selected) {
    if (!pathIsAbsolute(selected)) throw new Error('ASTRID_WORKSPACE_DISCOVERY must be an absolute path');
    return (path?.resolve ?? resolve)(selected);
  }
  const roots = [supportRoot, dataRoot].map((value) => value?.trim()).filter(Boolean);
  if (roots.some((value) => !pathIsAbsolute(value))) throw new Error('Runtime support root must be an absolute path');
  const canonical = (value) => { try { return realpathSync(value); } catch { return (path?.resolve ?? resolve)(value); } };
  if (roots.length === 2 && canonical(roots[0]) !== canonical(roots[1])) {
    throw new Error('ASTRID_SUPPORT_ROOT and ASTRID_RUNTIME_DATA_ROOT select different roots');
  }
  return (path?.join ?? join)(roots[0] || resolveRuntimeDataRoot({ platform, env, home }), 'runtime', 'discovery.json');
}

/** Quote one command path for the shell snippets shown to the person. */
export function shellQuote(value, platform = process.platform) {
  const command = String(value);
  if (platform === 'win32') return `'${command.replaceAll("'", "''")}'`;
  return /^[A-Za-z0-9_./:=-]+$/.test(command) ? command : `'${command.replaceAll("'", "'\"'\"'")}'`;
}
