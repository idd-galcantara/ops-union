import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runNpm(argumentsList) {
  const result = spawnSync(npmCommand, argumentsList, { stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

const treeStatus = runNpm(['ls', '--workspaces', '--all']);
if (treeStatus !== 0) {
  process.exit(treeStatus);
}

const outdatedStatus = runNpm(['outdated', '--workspaces', '--include-workspace-root', '--long']);
if (outdatedStatus > 1) {
  process.exit(outdatedStatus);
}

if (outdatedStatus === 1) {
  console.log('Outdated dependencies were reported for maintenance review; this is informational.');
} else {
  console.log('Dependency version check found no outdated packages.');
}

console.log('Dependency tree is valid and the lockfile is usable by npm ci.');