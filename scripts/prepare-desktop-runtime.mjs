import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootLockfile = path.join(root, 'package-lock.json');
const stagingDirectory = path.join(root, '.build', 'backend-runtime');
const backendPackage = path.join(root, 'backend', 'package.json');
const forbiddenNames = new Set(['.kube', 'kubeconfig']);

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? 'unknown'}.`));
    });
  });
}

async function assertNoKubeconfigFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (forbiddenNames.has(entry.name.toLowerCase())) {
      throw new Error(`Refusing to package sensitive path: ${entry.name}`);
    }
    if (entry.isDirectory()) await assertNoKubeconfigFiles(path.join(directory, entry.name));
  }
}

await rm(stagingDirectory, { recursive: true, force: true });
await mkdir(stagingDirectory, { recursive: true });
await cp(backendPackage, path.join(stagingDirectory, 'package.json'));
const rootLock = JSON.parse(await readFile(rootLockfile, 'utf8'));

const packageJson = JSON.parse(await readFile(path.join(stagingDirectory, 'package.json'), 'utf8'));
if (!packageJson.dependencies || Object.keys(packageJson.dependencies).length === 0) {
  throw new Error('Backend production dependencies are missing from backend/package.json.');
}

for (const [name, range] of Object.entries(packageJson.dependencies)) {
  const locked = rootLock.packages[`node_modules/${name}`]?.version;
  if (!locked) throw new Error(`Dependency ${name} is absent from the reviewed root lockfile.`);
  packageJson.dependencies[name] = locked;
}
await writeFile(path.join(stagingDirectory, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

await run(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['install', '--omit=dev', '--ignore-scripts', '--package-lock-only'],
  stagingDirectory,
);
await run(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['ci', '--omit=dev', '--ignore-scripts'],
  stagingDirectory,
);
await assertNoKubeconfigFiles(path.join(root, 'backend', 'dist'));
await assertNoKubeconfigFiles(path.join(root, 'frontend', 'dist'));
await writeFile(
  path.join(stagingDirectory, '.ops-union-runtime'),
  'Production dependencies for the local ops-union backend.\n',
  'utf8',
);

console.log(`Prepared backend runtime at ${path.relative(root, stagingDirectory)}.`);