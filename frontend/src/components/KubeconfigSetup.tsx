import { Check, CircleAlert, FolderOpen, Loader, RotateCcw } from 'lucide-react';
import { useOpsFlowStore } from '../store';

function sourceLabel(source: 'environment' | 'selected' | 'default'): string {
  if (source === 'environment') return 'KUBECONFIG';
  if (source === 'selected') return 'Selected file';
  return 'Default location';
}

export function KubeconfigSetup() {
  const status = useOpsFlowStore((state) => state.kubeconfigStatus);
  const loading = useOpsFlowStore((state) => state.kubeconfigStatusLoading);
  const error = useOpsFlowStore((state) => state.kubeconfigStatusError);
  const selectKubeconfig = useOpsFlowStore((state) => state.selectKubeconfig);
  const resetKubeconfig = useOpsFlowStore((state) => state.resetKubeconfig);
  const canSelect = Boolean(window.opsFlowDesktop);
  const canReset = canSelect && status?.source === 'selected';

  if (loading && !status) {
    return (
      <div className="kubeconfig-panel is-loading" role="status">
        <Loader size={14} className="spinning" />
        <span>Checking kubeconfig...</span>
      </div>
    );
  }

  if (error && !status) {
    return (
      <section className="kubeconfig-panel is-error" role="alert">
        <div className="kubeconfig-panel-icon" aria-hidden="true">
          <CircleAlert size={14} />
        </div>
        <div className="kubeconfig-panel-content">
          <strong>Could not check kubeconfig</strong>
          <small>{error}</small>
        </div>
      </section>
    );
  }

  return (
    <section className={`kubeconfig-panel ${status?.available ? 'is-ready' : 'is-missing'}`}>
      <div className="kubeconfig-panel-icon" aria-hidden="true">
        {status?.available ? <Check size={14} /> : <CircleAlert size={14} />}
      </div>
      <div className="kubeconfig-panel-content">
        <strong>{status?.available ? 'Kubeconfig ready' : 'Kubeconfig not found'}</strong>
        <span>
          {status?.available
            ? `${sourceLabel(status.source)}${status.contextCount === undefined ? '' : ` · ${status.contextCount} contexts`}`
            : status?.source === 'selected'
              ? 'The selected kubeconfig is unavailable. Reset to normal discovery.'
              : canSelect
              ? 'Choose a file to load its contexts.'
              : 'Set KUBECONFIG or place a config in the default location.'}
        </span>
        {error && <small role="alert">{error}</small>}
      </div>
      {canSelect && (
        <>
          <button
            type="button"
            className="icon-button subtle"
            title="Select kubeconfig file"
            aria-label="Select kubeconfig file"
            onClick={() => void selectKubeconfig()}
            disabled={loading}
          >
            {loading ? <Loader size={14} className="spinning" /> : <FolderOpen size={14} />}
          </button>
          {canReset && (
            <button
              type="button"
              className="icon-button subtle"
              title="Reset to normal kubeconfig discovery"
              aria-label="Reset to normal kubeconfig discovery"
              onClick={() => void resetKubeconfig()}
              disabled={loading}
            >
              {loading ? <Loader size={14} className="spinning" /> : <RotateCcw size={14} />}
            </button>
          )}
        </>
      )}
    </section>
  );
}