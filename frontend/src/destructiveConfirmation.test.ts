import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DestructiveConfirmation, type DestructiveConfirmationProps } from './components/DestructiveConfirmation';

function renderConfirmation(overrides: Partial<DestructiveConfirmationProps> = {}) {
  const props: DestructiveConfirmationProps = {
    title: 'Delete Workspace "Production"?',
    description: 'This removes saved data only.',
    context: createElement('p', null, '3 saved presets'),
    confirmLabel: 'Delete Workspace',
    onConfirm: () => undefined,
    onCancel: () => undefined,
    ...overrides,
  };
  return renderToStaticMarkup(createElement(DestructiveConfirmation, props));
}

test('destructive confirmation exposes semantic dialog context and named actions', () => {
  const markup = renderConfirmation();

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /aria-labelledby="[^"]+"/);
  assert.match(markup, /aria-describedby="[^"]+"/);
  assert.match(markup, /Delete Workspace &quot;Production&quot;\?/);
  assert.match(markup, /This removes saved data only\./);
  assert.match(markup, /3 saved presets/);
  assert.match(markup, />Cancel</);
  assert.match(markup, />Delete Workspace</);
});

test('pending confirmation disables dismissal and duplicate submission', () => {
  const markup = renderConfirmation({ pending: true });

  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /disabled=""[^>]*aria-label="Cancel"|aria-label="Cancel"[^>]*disabled=""/);
  assert.match(markup, /disabled=""/);
  assert.match(markup, /Deleting\.\.\./);
});
