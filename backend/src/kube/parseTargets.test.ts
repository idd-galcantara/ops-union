import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTargets } from './parseTargets.js';

test('parseTargets accepts a valid list and trims values', () => {
  const result = parseTargets({
    targets: [{ cluster: ' cluster-a ', namespace: ' namespace-a ' }],
  });
  assert.ok('targets' in result);
  if ('targets' in result) {
    assert.deepEqual(result.targets, [
      { cluster: 'cluster-a', namespace: 'namespace-a' },
    ]);
  }
});

test('parseTargets accepts multiple namespaces on the same cluster', () => {
  const result = parseTargets({
    targets: [
      { cluster: 'cluster-b', namespace: 'namespace-a' },
      { cluster: 'cluster-b', namespace: 'namespace-b' },
    ],
  });
  assert.ok('targets' in result);
  if ('targets' in result) assert.equal(result.targets.length, 2);
});

test('parseTargets rejects a non-object body', () => {
  assert.ok('error' in parseTargets(null));
  assert.ok('error' in parseTargets('nope'));
});

test('parseTargets rejects an empty or missing targets list', () => {
  assert.ok('error' in parseTargets({}));
  assert.ok('error' in parseTargets({ targets: [] }));
});

test('parseTargets rejects targets with missing or empty fields', () => {
  assert.ok('error' in parseTargets({ targets: [{ cluster: 'a' }] }));
  assert.ok('error' in parseTargets({ targets: [{ cluster: '', namespace: 'x' }] }));
  assert.ok('error' in parseTargets({ targets: [{ cluster: 'a', namespace: '  ' }] }));
  assert.ok('error' in parseTargets({ targets: ['not-an-object'] }));
});

test('parseTargets deduplicates targets and rejects the documented caps', () => {
  const deduplicated = parseTargets({ targets: [{ cluster: 'c', namespace: 'n' }, { cluster: ' c ', namespace: ' n ' }] });
  assert.deepEqual('targets' in deduplicated ? deduplicated.targets : [], [{ cluster: 'c', namespace: 'n' }]);
  assert.ok('error' in parseTargets({ targets: [{ cluster: 'x'.repeat(129), namespace: 'n' }] }));
  assert.ok('error' in parseTargets({ targets: Array.from({ length: 257 }, (_, index) => ({ cluster: `c-${index}`, namespace: 'n' })) }));
});
