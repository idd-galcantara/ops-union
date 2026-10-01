import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getNamespaces, parseClusters, type NamespaceLister } from './namespacesService.js';

test('getNamespaces merges namespaces and records where each one exists', async () => {
  const lister: NamespaceLister = async (cluster) =>
    cluster === 'cluster-a' ? ['namespace-a', 'namespace-system'] : ['namespace-a', 'namespace-b'];

  const { namespaces, errors } = await getNamespaces(['cluster-a', 'cluster-b'], lister);

  assert.equal(errors.length, 0);
  assert.deepEqual(
    namespaces.map((n) => [n.name, n.clusters]),
    [
      ['namespace-a', ['cluster-a', 'cluster-b']],
      ['namespace-b', ['cluster-b']],
      ['namespace-system', ['cluster-a']],
    ],
    'ordenado por nome, com os clusters de cada namespace',
  );
});

test('getNamespaces isolates a failing cluster and keeps the others', async () => {
  const lister: NamespaceLister = async (cluster) => {
    if (cluster === 'quebrado') throw new Error('cluster unreachable');
    return ['namespace-a'];
  };

  const { namespaces, errors } = await getNamespaces(['cluster-a', 'quebrado'], lister);

  assert.equal(namespaces.length, 1);
  assert.deepEqual(namespaces[0].clusters, ['cluster-a']);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].cluster, 'quebrado');
  assert.match(errors[0].message, /unreachable/);
});

test('getNamespaces deduplicates the requested clusters', async () => {
  const seen: string[] = [];
  const lister: NamespaceLister = async (cluster) => {
    seen.push(cluster);
    return ['ns'];
  };

  await getNamespaces(['cluster-a', 'cluster-a', ' cluster-a '], lister);

  assert.deepEqual(seen, ['cluster-a'], 'consulta cada cluster uma única vez');
});

test('getNamespaces returns empty for an empty cluster list', async () => {
  const result = await getNamespaces([], async () => ['ns']);
  assert.deepEqual(result, { namespaces: [], errors: [] });
});

test('parseClusters accepts a valid list and trims names', () => {
  const result = parseClusters({ clusters: [' cluster-a ', 'cluster-b'] });
  assert.ok('clusters' in result);
  if ('clusters' in result) {
    assert.deepEqual(result.clusters, ['cluster-a', 'cluster-b']);
  }
});

test('parseClusters rejects invalid bodies', () => {
  assert.ok('error' in parseClusters(null));
  assert.ok('error' in parseClusters({}));
  assert.ok('error' in parseClusters({ clusters: [] }));
  assert.ok('error' in parseClusters({ clusters: [''] }));
  assert.ok('error' in parseClusters({ clusters: [123] }));
});

test('parseClusters caps contexts before service fan-out', () => {
  assert.ok('error' in parseClusters({ clusters: Array.from({ length: 33 }, (_, index) => `cluster-${index}`) }));
  assert.ok('error' in parseClusters({ clusters: ['x'.repeat(129)] }));
});

test('getNamespaces never exceeds the bounded read scheduler', async () => {
  let active = 0;
  let maximum = 0;
  const result = await getNamespaces(Array.from({ length: 20 }, (_, index) => `cluster-${index}`), async (cluster) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
    return [cluster];
  });
  assert.equal(result.errors.length, 0);
  assert.ok(maximum <= 8);
});
