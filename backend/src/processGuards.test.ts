import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleProcessError, registerProcessGuards, sanitizeFatal } from './processGuards.js';

test('sanitizeFatal strips secret-bearing ApiException-style messages', () => {
  const message = sanitizeFatal({
    code: 500,
    message: 'HTTP-Code: 500\nMessage: Error\nBody: secret\nHeaders: authorization: Bearer top-secret',
  });
  assert.ok(!message.toLowerCase().includes('authorization'));
  assert.ok(!message.includes('secret'));
});

test('handleProcessError logs sanitized output and does not exit on a runtime error', () => {
  const logged: string[] = [];
  let exitCalls = 0;
  handleProcessError(
    'uncaughtException',
    { code: 500, message: 'HTTP-Code: 500\nMessage: Error\nBody: secret\nHeaders: authorization' },
    { log: (line) => logged.push(line), exit: () => { exitCalls += 1; } },
  );
  assert.equal(exitCalls, 0);
  assert.ok(logged.length >= 1);
  assert.ok(logged[0].startsWith('[uncaughtException]'));
  assert.ok(!logged.join('\n').toLowerCase().includes('authorization'));
  assert.ok(!logged.join('\n').includes('secret'));
});

test('handleProcessError logs a sanitized stack when present without a secret line', () => {
  const logged: string[] = [];
  const error = new Error('boom');
  error.stack = 'Error: boom\n    at authorization: Bearer leaked\n    at safeFrame (file.ts:1:1)';
  handleProcessError('unhandledRejection', error, { log: (line) => logged.push(line) });
  const output = logged.join('\n');
  assert.ok(output.includes('safeFrame'));
  assert.ok(!output.toLowerCase().includes('authorization'));
});

test('registerProcessGuards attaches and removes its own listeners', () => {
  const before = process.listenerCount('uncaughtException');
  const dispose = registerProcessGuards({ log: () => undefined });
  assert.equal(process.listenerCount('uncaughtException'), before + 1);
  dispose();
  assert.equal(process.listenerCount('uncaughtException'), before);
});
