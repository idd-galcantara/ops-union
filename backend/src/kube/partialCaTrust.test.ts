import assert from 'node:assert/strict';
import { Agent as HttpsAgent } from 'node:https';
import { test } from 'node:test';
import { KubeConfig } from '@kubernetes/client-node';
import { PartialCaTrustKubeConfig } from './partialCaTrust.js';

const CA = Buffer.from('certificate data').toString('base64');

function cluster(proxyUrl?: string): NonNullable<
  Parameters<KubeConfig['createDispatcherOptions']>[0]
> {
  return {
    name: 'cluster',
    server: 'https://cluster.example.test',
    proxyUrl,
  };
}

test('marks kubeconfig CA data as a partial trust anchor for direct API TLS', () => {
  const kubeConfig = new PartialCaTrustKubeConfig();
  const options = kubeConfig.createDispatcherOptions(cluster(), { ca: Buffer.from('ca') });

  assert.equal(options.type, 'agent');
  if (options.type !== 'agent') return;
  assert.equal(options.connect.allowPartialTrustChain, true);
  assert.notEqual(options.connect.rejectUnauthorized, false);
});

test('marks kubeconfig CA data as a partial trust anchor for proxied API TLS', () => {
  const kubeConfig = new PartialCaTrustKubeConfig();
  const options = kubeConfig.createDispatcherOptions(
    cluster('https://proxy.example.test'),
    { ca: Buffer.from('ca') },
  );

  assert.equal(options.type, 'proxy');
  if (options.type !== 'proxy') return;
  assert.equal(options.requestTls.allowPartialTrustChain, true);
  assert.notEqual(options.requestTls.rejectUnauthorized, false);
});

test('does not enable partial-chain trust without a kubeconfig CA', () => {
  const kubeConfig = new PartialCaTrustKubeConfig();
  const options = kubeConfig.createDispatcherOptions(cluster(), {});

  assert.deepEqual(options, { type: 'none' });
});

test('applies partial-chain trust to HTTPS agents used by WebSocket clients', async () => {
  const kubeConfig = new PartialCaTrustKubeConfig();
  kubeConfig.loadFromOptions({
    clusters: [{
      name: 'cluster',
      server: 'https://cluster.example.test',
      caData: CA,
    }],
    users: [{ name: 'user' }],
    contexts: [{ name: 'context', cluster: 'cluster', user: 'user' }],
    currentContext: 'context',
  });

  const options: Parameters<KubeConfig['applyToHTTPSOptions']>[0] = {};
  await kubeConfig.applyToHTTPSOptions(options);

  assert.ok(options.agent instanceof HttpsAgent);
  if (!(options.agent instanceof HttpsAgent)) return;
  assert.equal(options.agent.options.allowPartialTrustChain, true);
  assert.notEqual(options.agent.options.rejectUnauthorized, false);
});
