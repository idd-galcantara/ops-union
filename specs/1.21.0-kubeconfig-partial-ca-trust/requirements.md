# Requirements - ops-union v1.21.0 kubeconfig partial CA trust

## Scope

Version 1.21.0 removes Ops Union's dependency on the operating system trust store for Kubernetes
clusters whose kubeconfig explicitly provides a non-self-signed CA certificate. The kubeconfig CA
is used as a TLS trust anchor through Node.js partial-chain verification.

The change addresses TLS failures where the API server presents a leaf certificate and the
kubeconfig supplies its cluster CA, but the CA's own issuer is not installed in the WSL/Linux system
trust store. The existing behavior of concatenating system roots does not work in that environment.

The application remains local and read-only. This specification does not authorize Kubernetes
mutations, disabling TLS verification, changing system certificates, committing, pushing, tagging,
packaging, or releasing the application.

## User story

As an operator using a valid kubeconfig in WSL, I can use Ops Union without installing the
organization's CA chain into the WSL trust store, while the application continues to authenticate
the Kubernetes API server's certificate.

## Requirements

### PCT-1 - Trust the kubeconfig CA as a partial chain anchor

1. When a cluster has an explicit CA in `certificate-authority-data` or `certificate-authority`,
   Ops Union SHALL enable Node.js `allowPartialTrustChain` for the TLS connection using that CA.
2. The configured CA SHALL remain scoped to its kubeconfig cluster; no additional system or
   unrelated CA roots SHALL be added.
3. This behavior SHALL cover Kubernetes REST requests using the `@kubernetes/client-node`
   dispatcher and HTTPS agents used by direct WebSocket connections.
4. Proxied REST requests SHALL apply partial-chain trust to the TLS connection to the Kubernetes
   API server, not to the proxy connection.

### PCT-2 - Preserve TLS verification

1. Certificate-chain signature and server-hostname verification SHALL remain enabled.
2. The implementation SHALL NOT set `rejectUnauthorized: false`, `skipTLSVerify`, or
   `NODE_TLS_REJECT_UNAUTHORIZED=0` to implement this feature.
3. Existing kubeconfig `skipTLSVerify` behavior SHALL remain unchanged; this feature SHALL NOT
   enable or recommend it.
4. When a cluster has no explicit CA, the existing Node.js default trust behavior SHALL remain in
   effect.

### PCT-3 - Preserve kubeconfig and application boundaries

1. Ops Union SHALL NOT read or concatenate the operating system CA bundle for this code path.
2. The kubeconfig CA bytes SHALL NOT be rewritten, persisted, or returned to the frontend.
3. Tokens, keys, certificates, and other kubeconfig contents SHALL NOT be logged or exposed.
4. Existing context isolation, read-only Kubernetes behavior, and local-only backend binding SHALL
   remain unchanged.

### PCT-4 - Focused verification

1. Backend tests SHALL verify the partial-chain option for direct and proxied REST dispatchers and
   direct HTTPS agents.
2. Tests SHALL verify that partial-chain trust is not enabled without a configured CA and that TLS
   verification is not disabled.
3. Backend typecheck, backend tests, backend build, and `git diff --check` SHALL pass.
4. The validation record SHALL distinguish unit/build checks from live-cluster and packaged-app
   checks.

## Definition of done

- Kubernetes API clients use only the CA explicitly supplied by kubeconfig as their trust anchor,
  without relying on the WSL/Linux system CA bundle (PCT-1).
- TLS certificate and hostname verification remain enabled (PCT-2).
- Kubeconfig secrecy, read-only behavior, context scoping, and local-only binding remain intact
  (PCT-3).
- Focused tests and backend validation pass, with live and packaging limitations recorded (PCT-4).
