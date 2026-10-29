import { spawn } from 'node:child_process';
import { win32 } from 'node:path';

/** Stop an owned service (started in its own process group on POSIX), including its descendants. */
export async function terminateProcessTree(child, signal = 'SIGTERM', {
  platform = process.platform, spawnProcess = spawn, killProcess = process.kill,
} = {}) {
  if (!child.pid) return;
  if (platform === 'win32') {
    if (child.exitCode !== null || child.signalCode !== null) return;
    // Kill the tree while its root still exists. Killing npm first loses the
    // cmd.exe/Vite descendants, whose inherited pipes can also hold close open.
    const command = win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
    await new Promise((resolve, reject) => {
      const killer = spawnProcess(command, ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      killer.once('error', reject);
      killer.once('close', (code) => {
        if (code !== 0 && child.exitCode === null && child.signalCode === null) {
          reject(new Error(`taskkill failed for process ${child.pid} (exit ${code})`));
        } else resolve();
      });
    });
  } else {
    try { killProcess(-child.pid, signal); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
}
