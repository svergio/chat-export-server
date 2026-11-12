import fs from 'node:fs';
import path from 'node:path';

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err?.code === 'EPERM';
  }
}

export function readPidFile(pidPath: string): number | null {
  try {
    if (!fs.existsSync(pidPath)) return null;
    const raw = fs.readFileSync(pidPath, 'utf8').trim();
    const pid = Number(raw);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function writePidFile(
  pidPath: string,
  pid: number = process.pid
): { previousPid: number | null; warnedLiveForeign: boolean } {
  const previousPid = readPidFile(pidPath);
  let warnedLiveForeign = false;
  if (previousPid != null && previousPid !== pid && pidAlive(previousPid)) {
    warnedLiveForeign = true;
    process.stderr.write(
      `chat-export-server: ${pidPath} points to live pid ${previousPid}; writing this process (${pid}) without signaling the other process\n`
    );
  }
  fs.mkdirSync(path.dirname(pidPath), { recursive: true });
  fs.writeFileSync(pidPath, String(pid) + '\n', { encoding: 'utf8', mode: 0o600 });
  return { previousPid, warnedLiveForeign };
}

export function clearPidFile(pidPath: string, pid: number = process.pid): void {
  const current = readPidFile(pidPath);
  if (current != null && current !== pid) return;
  try {
    if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath);
  } catch {
    /* ignore */
  }
}
