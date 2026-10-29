import { readFileSync } from 'node:fs';

export function processHasExited(pid: number): boolean {
  try {
    process.kill(pid, 0);
    if (process.platform === 'linux') {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      // Containers may leave an exited descendant waiting for PID 1 to reap it.
      return stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z ');
    }
    return false;
  } catch (error) {
    if (['ESRCH', 'ENOENT'].includes((error as NodeJS.ErrnoException).code ?? '')) return true;
    throw error;
  }
}
