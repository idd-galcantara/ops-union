#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
KUBECONFIG="${OPS_UNION_KUBECONFIG:-${HOME:?HOME must be set}/.kube/config}"
KIND_CONFIG="${ROOT_DIR}/k8s/dev/kind-config.yaml"
METRICS_SERVER_MANIFEST="https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.9.0/components.yaml"
KIND_NODE_IMAGE="${KIND_NODE_IMAGE:-kindest/node:v1.37.0}"

export KUBECONFIG

require_commands() {
  local command
  for command in docker kubectl kind; do
    if ! command -v "${command}" >/dev/null 2>&1; then
      printf 'Required command not found: %s\n' "${command}" >&2
      exit 1
    fi
  done

  if [[ -r /proc/sys/fs/inotify/max_user_instances ]] &&
    (( $(< /proc/sys/fs/inotify/max_user_instances) < 256 )); then
    printf 'Linux fs.inotify.max_user_instances is below 256. Increase it before creating both clusters, for example:\n' >&2
    printf '  sudo sysctl -w fs.inotify.max_user_instances=256\n' >&2
    exit 1
  fi
}

kind_cluster_exists() {
  kind get clusters | grep -Fxq -- "$1"
}

context_exists() {
  kubectl config get-contexts -o name | grep -Fxq -- "$1"
}

wait_for_nodes() {
  local context="$1"
  local node_count
  local ready_count

  for _ in {1..60}; do
    node_count="$(kubectl --context "${context}" get nodes --no-headers 2>/dev/null | wc -l)"
    ready_count="$(kubectl --context "${context}" get nodes --no-headers 2>/dev/null | awk '$2 == "Ready" { count++ } END { print count + 0 }')"
    if [[ "${node_count}" -ge 2 && "${ready_count}" -ge 2 ]]; then
      return 0
    fi
    sleep 5
  done

  printf 'Cluster %s did not bring both kind nodes to Ready.\n' "${context}" >&2
  kubectl --context "${context}" get nodes -o wide >&2 || true
  return 1
}

create_cluster() {
  local name="$1"

  if kind_cluster_exists "${name}"; then
    printf 'Using existing kind cluster %s.\n' "${name}"
  else
    printf 'Creating kind cluster %s.\n' "${name}"
    kind create cluster \
      --name "${name}" \
      --config "${KIND_CONFIG}" \
      --image "${KIND_NODE_IMAGE}" \
      --wait 5m
  fi

  kind export kubeconfig --name "${name}" --kubeconfig "${KUBECONFIG}"

  if ! context_exists "kind-${name}"; then
    printf 'Expected kubeconfig context kind-%s was not created.\n' "${name}" >&2
    exit 1
  fi

  kubectl --context "kind-${name}" cluster-info --request-timeout=30s >/dev/null
  wait_for_nodes "kind-${name}"
}

wait_for_workloads() {
  local context="$1"
  local cluster="$2"
  local namespace
  local deployment

  while IFS=$'\t' read -r namespace deployment; do
    [[ -n "${deployment}" ]] || continue
    kubectl --context "${context}" --namespace "${namespace}" \
      rollout status "deployment/${deployment}" --timeout=180s
  done < <(
    kubectl --context "${context}" get deployments --all-namespaces \
      --selector "ops-union.dev/cluster=${cluster}" \
      -o 'jsonpath={range .items[*]}{.metadata.namespace}{"\t"}{.metadata.name}{"\n"}{end}'
  )
}

install_metrics_server() {
  local context="$1"
  local current_args
  local attempt

  printf 'Installing metrics-server in %s.\n' "${context}"
  if ! kubectl --context "${context}" apply -f "${METRICS_SERVER_MANIFEST}"; then
    printf 'Warning: metrics-server installation failed in %s; continuing without metrics.\n' "${context}" >&2
    return 0
  fi

  if ! current_args="$(kubectl --context "${context}" --namespace kube-system \
    get deployment metrics-server -o 'jsonpath={.spec.template.spec.containers[0].args}')"; then
    printf 'Warning: metrics-server is not available in %s yet; continuing.\n' "${context}" >&2
    return 0
  fi

  if [[ "${current_args}" != *"--kubelet-insecure-tls"* ]]; then
    if ! kubectl --context "${context}" --namespace kube-system \
      patch deployment metrics-server --type=json \
      --patch='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'; then
      printf 'Warning: could not configure kind kubelet TLS in %s; metrics may be unavailable.\n' "${context}" >&2
      return 0
    fi
  fi

  if ! kubectl --context "${context}" --namespace kube-system \
    rollout status deployment/metrics-server --timeout=120s; then
    printf 'Warning: metrics-server is not ready in %s yet; continuing without metrics.\n' "${context}" >&2
    return 0
  fi

  for attempt in {1..12}; do
    if kubectl --context "${context}" top pods --all-namespaces >/dev/null 2>&1; then
      printf 'Pod metrics are available in %s.\n' "${context}"
      return 0
    fi
    sleep 5
  done

  printf 'Warning: metrics-server has not published metrics in %s yet; retry kubectl top later.\n' "${context}" >&2
}

main() {
  local name
  local context

  require_commands
  if ! docker info >/dev/null; then
    printf 'Cannot reach Docker. Start Docker and ensure the current user can access it.\n' >&2
    exit 1
  fi

  mkdir -p "$(dirname -- "${KUBECONFIG}")"

  for name in ops-dev ops-staging; do
    context="kind-${name}"
    create_cluster "${name}"
    kubectl --context "${context}" apply -f "${ROOT_DIR}/k8s/dev/namespaces.yaml"
    if [[ "${name}" == ops-dev ]]; then
      kubectl --context "${context}" apply -f "${ROOT_DIR}/k8s/dev/namespaces-dev.yaml"
    fi
    kubectl --context "${context}" apply -f "${ROOT_DIR}/k8s/dev/${name}.yaml"
    wait_for_workloads "${context}" "${name}"
    install_metrics_server "${context}"
  done

  printf '\nLocal clusters are ready. Kubeconfig contexts:\n'
  kubectl config get-contexts
}

main "$@"
