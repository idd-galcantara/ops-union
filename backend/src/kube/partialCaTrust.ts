import { Agent as HttpsAgent } from 'node:https';
import { KubeConfig } from '@kubernetes/client-node';

type DispatcherOptions = ReturnType<KubeConfig['createDispatcherOptions']>;
type DispatcherArguments = Parameters<KubeConfig['createDispatcherOptions']>;
type HttpsOptions = Parameters<KubeConfig['applyToHTTPSOptions']>[0];

export class PartialCaTrustKubeConfig extends KubeConfig {
  private readonly partialAgentCache = new WeakMap<HttpsAgent, HttpsAgent>();

  override createDispatcherOptions(
    cluster: DispatcherArguments[0],
    agentOptions: DispatcherArguments[1],
  ): DispatcherOptions {
    const options = super.createDispatcherOptions(cluster, agentOptions);
    if (agentOptions.ca === undefined || cluster?.skipTLSVerify) return options;

    switch (options.type) {
      case 'agent':
        return {
          ...options,
          connect: { ...options.connect, allowPartialTrustChain: true },
        };
      case 'proxy':
      case 'socks':
        return {
          ...options,
          requestTls: { ...options.requestTls, allowPartialTrustChain: true },
        };
      default:
        return options;
    }
  }

  override async applyToHTTPSOptions(opts: HttpsOptions): Promise<void> {
    await super.applyToHTTPSOptions(opts);

    const cluster = this.getCurrentCluster();
    if (!cluster || cluster.skipTLSVerify || opts.ca === undefined) return;

    const agent = opts.agent;
    if (!(agent instanceof HttpsAgent)) return;

    let partialAgent = this.partialAgentCache.get(agent);
    if (!partialAgent) {
      partialAgent = new HttpsAgent({
        ...agent.options,
        allowPartialTrustChain: true,
      });
      this.partialAgentCache.set(agent, partialAgent);
    }

    opts.agent = partialAgent;
  }
}
