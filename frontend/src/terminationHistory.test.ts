import assert from 'node:assert/strict';
import { test } from 'node:test';
import { terminationEntryDetails, terminationEntryTitle } from './terminationHistory';

test('termination history formatting includes container termination metadata', () => {
  const entry = {
    source: 'container' as const,
    container: 'api',
    state: 'terminated',
    reason: 'OOMKilled',
    exitCode: 137,
    signal: 9,
  };

  assert.equal(terminationEntryTitle(entry), 'api · OOMKilled');
  assert.deepEqual(terminationEntryDetails(entry), ['terminated', 'exit code 137', 'signal 9']);
});

test('termination history formatting tolerates an undetailed event', () => {
  const entry = { source: 'event' as const, message: 'Pod event without optional metadata' };

  assert.equal(terminationEntryTitle(entry), 'Pod event');
  assert.deepEqual(terminationEntryDetails(entry), []);
});