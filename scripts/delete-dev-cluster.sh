#!/usr/bin/env bash
set -Eeuo pipefail

KUBECONFIG="${OPS_UNION_KUBECONFIG:-${HOME:?HOME must be set}/.kube/config}"
export KUBECONFIG

for command in kind; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "${command}" >&2
    exit 1
  fi
done

if ! clusters="$(kind get clusters)"; then
  printf 'Could not list kind clusters. Check that Docker is running and accessible.\n' >&2
  exit 1
fi

for name in ops-dev ops-staging; do
  if grep -Fxq -- "${name}" <<< "${clusters}"; then
    kind delete cluster --name "${name}"
  else
    printf 'kind cluster %s does not exist; skipping.\n' "${name}"
  fi
done
