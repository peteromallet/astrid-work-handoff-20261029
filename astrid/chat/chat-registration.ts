import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function chatRegistrationPath(discoveryPath: string): string {
  return join(dirname(discoveryPath), 'chat.json');
}

export function chatRegistration(portValue: number | string, token: string) {
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('the chat bridge port must be an integer from 1 to 65535');
  if (!token) throw new Error('the chat bridge needs a credential');
  return { endpoint: `http://127.0.0.1:${port}`, token };
}

export function writeChatRegistration(path: string, registration: ReturnType<typeof chatRegistration>): void {
  const temporary = join(dirname(path), `.chat.json.${randomBytes(6).toString('hex')}`);
  try {
    writeFileSync(temporary, JSON.stringify(registration), { mode: 0o600, flag: 'wx' });
    if (process.platform === 'win32') {
      // chmod does not set a Windows DACL. Use the shared Runtime platform boundary.
      const python = process.env.ASTRID_SERVICE_PYTHON;
      if (!python) throw new Error('ASTRID_SERVICE_PYTHON is required to secure the chat credential on Windows');
      execFileSync(python, ['-m', 'astrid.services', 'secure-file', temporary], { stdio: 'pipe' });
    }
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

export function removeChatRegistration(path: string, owned: (value: ReturnType<typeof chatRegistration>) => boolean): void {
  let current;
  try { current = JSON.parse(readFileSync(path, 'utf8')); } catch { return; }
  if (owned(current)) rmSync(path, { force: true });
}
