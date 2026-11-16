# Design - ops-union v1.21.0 kubeconfig partial CA trust

## Context

The target kubeconfigs provide a cluster-specific CA certificate that is not self-signed. The API
servers present their leaf certificates, while the issuer above the kubeconfig CA is unavailable in
the WSL system trust store. With the default Node.js/OpenSSL chain-building behavior, using only
that intermediate CA fails with `unable to get issuer certificate`.

The previous implementation appended the operating system CA bundle to kubeconfig CA data. That
still depended on the missing issuer being present in the system store and altered the scoped
cluster's CA data in memory.

## Design

`backend/src/kube/partialCaTrust.ts` defines `PartialCaTrustKubeConfig`, a `KubeConfig` subclass
used for per-context clients:

- `createDispatcherOptions()` adds `allowPartialTrustChain: true` to the TLS options for direct
  Undici agents and to `requestTls` for HTTP/SOCKS proxy dispatchers, only when a CA is explicitly
  configured and TLS verification is not skipped.
- `applyToHTTPSOptions()` preserves the base kubeconfig options and replaces direct HTTPS agents
  with cached agents carrying the same options plus `allowPartialTrustChain: true`. This covers
  WebSocket clients without changing their certificate, key, proxy, or authorization settings.
- `scopedConfigForContext()` instantiates this subclass and leaves the original CA data unchanged.
  The system CA bundle is no longer read or appended.

Node.js partial-chain verification allows the CA certificate explicitly configured by the user to
act as a trust anchor even though it is not self-signed. It does not turn off validation: the API
server's leaf certificate must still chain to that configured CA, and the server name must still
match.

## Compatibility and security

- The project runtime contract is Node.js 26.10.0; this runtime supports
  `allowPartialTrustChain`.
- No trust is added for clusters without an explicit kubeconfig CA.
- `rejectUnauthorized` remains unchanged; no insecure TLS fallback is introduced.
- CA data remains in memory in the backend and is never returned to the UI.
- Existing context-scoped client caches and read-only API usage are unchanged.

## Alternatives considered

- **Install the organizational CA into the WSL trust store:** secure, but requires machine-level
  setup and does not travel with the kubeconfig.
- **Bundle the full issuer chain into every kubeconfig:** secure if obtained from the trusted
  platform source, but requires a kubeconfig change outside Ops Union.
- **Disable TLS verification:** rejected because it permits impersonation of the Kubernetes API
  server and could expose authentication credentials.

## Validation boundaries

Unit tests exercise TLS-option mapping without relying on a live cluster. A separate read-only
handshake check exercises the configured CA against the two affected contexts without sending
authentication credentials. Packaging and installing a new desktop build are separate release
steps and are not part of this design.
