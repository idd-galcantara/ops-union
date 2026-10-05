import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BackendUnavailableError, backendUnavailableMessage, isBackendUnavailable } from './api';

/**
 * Mirrors PodDetailsPanel's messageOf so the presentation mapping is covered by
 * a pure test (there is no DOM harness). Keep this in sync with that component.
 */
function messageOf(reason: unknown): string {
  if (isBackendUnavailable(reason)) return backendUnavailableMessage();
  return reason instanceof Error ? reason.message : 'Failed to load.';
}

test('a 502-derived BackendUnavailableError surfaces the distinguished message', () => {
  const reason = new BackendUnavailableError();
  assert.equal(isBackendUnavailable(reason), true);
  assert.equal(messageOf(reason), backendUnavailableMessage());
  assert.notEqual(messageOf(reason), 'HTTP 502');
});

test('a thrown network error (fetch rejection) maps to backend-unavailable', () => {
  // fetch() rejects with a TypeError when the local backend refuses the connection.
  const reason = new TypeError('Failed to fetch');
  assert.equal(isBackendUnavailable(reason), true);
  assert.equal(messageOf(reason), backendUnavailableMessage());
});

test('a normal application error keeps its own message', () => {
  const reason = new Error('Pod not found in namespace demo.');
  assert.equal(isBackendUnavailable(reason), false);
  assert.equal(messageOf(reason), 'Pod not found in namespace demo.');
  assert.notEqual(messageOf(reason), backendUnavailableMessage());
});

test('the backend-unavailable message is actionable and secret-free', () => {
  const message = backendUnavailableMessage();
  assert.ok(message.length > 0);
  assert.doesNotMatch(message, /authorization|token|secret|bearer|cert/i);
  assert.doesNotMatch(message, /HTTP 502/);
});
