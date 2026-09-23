#!/usr/bin/env bash
set -Eeuo pipefail

KUBECONFIG="${OPS_UNION_KUBECONFIG:-${HOME:?HOME must be set}/.kube/config}"
export KUBECONFIG

for command in kind kubectl; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "${command}" >&2
    exit 1
  fi
done

status=0

printf 'kind clusters:\n'
if clusters="$(kind get clusters)"; then
  if [[ -n "${clusters}" ]]; then
    printf '%s\n' "${clusters}"
  else
    printf 'No kind clusters found.\n'
  fi
else
  status=1
  clusters=""
fi

printf '\nKubeconfig contexts in %s:\n' "${KUBECONFIG}"
if [[ -r "${KUBECONFIG}" ]]; then
  if ! kubectl config get-contexts; then
    status=1
  fi
else
  printf 'No kubeconfig file found.\n'
fi

for name in ops-dev ops-staging; do
  context="kind-${name}"
  printf '\n=== %s (%s) ===\n' "${name}" "${context}"

  if ! grep -Fxq -- "${name}" <<< "${clusters}"; then
    printf 'Cluster is not present.\n'
    continue
  fi

  if ! kubectl config get-contexts -o name | grep -Fxq -- "${context}"; then
    printf 'Cluster exists, but kubeconfig context is missing.\n'
    status=1
    continue
  fi

  for resource in nodes namespaces pods; do
    printf '\n%s:\n' "${resource}"
    if [[ "${resource}" == pods ]]; then
      if ! kubectl --context "${context}" get pods --all-namespaces -o wide; then
        status=1
      fi
    elif ! kubectl --context "${context}" get "${resource}" -o wide; then
      status=1
    fi
  done
done

exit "${status}"
