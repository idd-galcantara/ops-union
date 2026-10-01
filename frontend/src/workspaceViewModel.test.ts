import assert from 'node:assert/strict';
import test from 'node:test';
import { areAllVisibleWorkspacesSelected, filterWorkspaces, getSelectedVisibleWorkspaceIds } from './workspaceViewModel';
import type { Workspace } from './workspaces';

const workspaces: Workspace[] = [
  { id: 'one', name: 'Operations', presets: [{ id: 'preset-one', name: 'Production', targets: [{ cluster: 'prod', namespace: 'ops' }] }] },
  { id: 'two', name: 'Review', description: 'QA checks', presets: [] },
];

test('workspace view model filters catalog text and tracks visible selection', () => {
  const visible = filterWorkspaces(workspaces, 'qa');
  assert.deepEqual(visible.map((workspace) => workspace.id), ['two']);
  assert.deepEqual(getSelectedVisibleWorkspaceIds(visible, ['one', 'two']), ['two']);
  assert.equal(areAllVisibleWorkspacesSelected(visible, ['one', 'two']), true);
});