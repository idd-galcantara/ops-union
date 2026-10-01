import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const SESSION_DIR_PREFIX = 'session-';

export function cleanupOrphanedHistorySessions(rootDir: string, graceMs: number, now = Date.now): number {
  if (!existsSync(rootDir)) return 0;
  let removed = 0;
  for (const name of readdirSync(rootDir)) {
    if (!name.startsWith(SESSION_DIR_PREFIX)) continue;
    const candidate = path.join(rootDir, name);
    try {
      if (now() - statSync(candidate).mtimeMs >= graceMs) {
        rmSync(candidate, { recursive: true, force: true });
        removed += 1;
      }
    } catch {
      // Startup cleanup is best effort and never exposes local filesystem details.
    }
  }
  return removed;
}
