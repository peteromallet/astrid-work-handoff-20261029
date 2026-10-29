import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, win32 } from 'node:path';

function packageManagerEntry(tool, { env = process.env, execPath = process.execPath, platform = process.platform, exists = existsSync, realpath = realpathSync } = {}) {
  if (tool !== 'npm' && tool !== 'npx') throw new Error(`Unsupported package manager: ${tool}`);
  const path = platform === 'win32' ? win32 : undefined;
  const pathJoin = path?.join ?? join;
  const pathDirname = path?.dirname ?? dirname;
  const pathResolve = path?.resolve ?? resolve;
  const entryName = tool === 'npm' ? 'npm-cli.js' : 'npx-cli.js';
  const configured = env.npm_execpath;
  if (configured) {
    const configuredName = configured.split(/[\\/]/).pop()?.toLowerCase();
    if (configuredName === 'npm-cli.js' || configuredName === 'npx-cli.js') {
      const entry = configured.replace(/(?:npm|npx)-cli\.js$/i, entryName);
      if (exists(entry)) return entry;
    }
  }

  const candidates = [pathJoin(pathDirname(execPath), 'node_modules', 'npm', 'bin', entryName)];
  candidates.push(pathJoin(pathDirname(pathDirname(execPath)), 'lib', 'node_modules', 'npm', 'bin', entryName));
  const searchPath = env.PATH || (platform === 'win32' ? env.Path : '') || '';
  for (const directory of searchPath.split(platform === 'win32' ? ';' : ':').filter(Boolean)) {
    for (const shim of [pathJoin(directory, tool), pathJoin(directory, `${tool}.cmd`), pathJoin(directory, `${tool}.exe`)]) {
      try {
        const target = realpath(shim);
        candidates.push(pathJoin(pathDirname(target), 'node_modules', 'npm', 'bin', entryName));
        candidates.push(pathJoin(pathDirname(target), '..', entryName));
        candidates.push(pathJoin(pathDirname(target), entryName));
      } catch { /* Not an installed npm shim. */ }
    }
  }
  const entry = candidates.find(exists);
  if (!entry) throw new Error(`Could not locate ${tool}'s JavaScript entrypoint; run this command through npm or install npm beside Node.js`);
  return pathResolve(entry);
}

export function packageManagerInvocation(tool, args, options = {}) {
  return { command: options.execPath || process.execPath, args: [packageManagerEntry(tool, options), ...args] };
}
