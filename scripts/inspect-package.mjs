import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const forbidden = /^(?:\.kube|kubeconfig|credentials?|token|secret|audit)$/i;
const forbiddenExtension = /\.(?:pem|key|crt|p12|pfx|kubeconfig|token|secret|audit)$/i;
const roots = [path.join(root, '.build', 'backend-runtime'), path.join(root, 'backend', 'dist'), path.join(root, 'frontend', 'dist'), path.join(root, 'desktop', 'dist'), path.join(root, 'release')];

async function visit(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return []; }
  const found = [];
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === 'node_modules') continue;
    const relative = path.relative(root, path.join(directory, entry.name));
    if (forbidden.test(entry.name) || forbiddenExtension.test(entry.name)) found.push(relative);
    if (entry.isDirectory()) found.push(...await visit(path.join(directory, entry.name)));
  }
  return found;
}

const findings = (await Promise.all(roots.map(visit))).flat();
if (findings.length > 0) throw new Error(`Package inspection found forbidden resource names: ${findings.join(', ')}`);
console.log(`Package inspection passed for ${roots.length} resource roots.`);