import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface BackendProcessOptions {
  projectRoot: string;
  frontendDist: string;
  port: number;
  internalToken: string;
  selectedKubeconfigPath?: string;
}

export function backendEntry(projectRoot: string): string {
  return path.join(projectRoot, 'backend', 'dist', 'index.js');
}

export function startBackend(options: BackendProcessOptions): ChildProcess {
  const entry = backendEntry(options.projectRoot);
  if (!existsSync(entry)) {
    throw new Error('The backend build was not found. Run the production build first.');
  }

  return spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      OPS_FLOW_PORT: String(options.port),
      OPS_FLOW_FRONTEND_DIST: options.frontendDist,
      OPS_FLOW_INTERNAL_TOKEN: options.internalToken,
      ...(options.selectedKubeconfigPath
        ? { OPS_FLOW_SELECTED_KUBECONFIG: options.selectedKubeconfigPath }
        : {}),
    },
    stdio: 'ignore',
    windowsHide: true,
  });
}

export async function waitForBackend(port: number, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
      lastError = new Error(`Backend health check returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('The local backend did not become ready.', { cause: lastError });
}

export function stopBackend(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null || child.killed) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(escalate);
      clearTimeout(failSafe);
      resolve();
    };
    const escalate = setTimeout(() => { if (!settled) child.kill('SIGKILL'); }, 4_000);
    const failSafe = setTimeout(finish, 5_000);
    child.once('exit', finish);
    child.kill('SIGTERM');
  });
}