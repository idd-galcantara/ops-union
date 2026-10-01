import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function parseVersion(version, name) {
  const match = version.trim().replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Unable to parse ${name} version: ${version}`);
  }

  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }

  return 0;
}

function assertRange(actualVersion, range, name) {
  const match = range.match(/^>=(\d+\.\d+\.\d+) <(\d+\.\d+\.\d+)$/);
  if (!match) {
    throw new Error(`Unsupported ${name} engine range: ${range}`);
  }

  const actual = parseVersion(actualVersion, name);
  const minimum = parseVersion(match[1], name);
  const exclusiveMaximum = parseVersion(match[2], name);

  if (compareVersions(actual, minimum) < 0 || compareVersions(actual, exclusiveMaximum) >= 0) {
    throw new Error(`${name} ${actualVersion} is outside the supported range ${range}`);
  }
}

const nodeVersion = process.versions.node;
const npmVersion = execFileSync(npmCommand, ['--version'], { encoding: 'utf8' }).trim();
const engines = packageJson.engines ?? {};

assertRange(nodeVersion, engines.node, 'Node.js');
assertRange(npmVersion, engines.npm, 'npm');

console.log(`Toolchain contract satisfied: Node.js ${nodeVersion}, npm ${npmVersion}.`);