import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Layers, Plus, RefreshCw, Search, X } from 'lucide-react';
import { canUseManualNamespace, hasExactNamespaceMatch } from '../namespaceSuggestions';
import { buildAvailableTargets, getTargetSelectionModel } from '../targetSelectionModel';
import type { ContextInfo, NamespaceInfo, Target } from '../types';
import { targetKey } from '../types';
import { ErrorState, LoadingState } from './Feedback';
import { KubeconfigSetup } from './KubeconfigSetup';
import { NamespaceInput } from './NamespaceInput';

interface TargetSelectionPanelProps {
  contexts: ContextInfo[];
  contextsLoading: boolean;
  contextsError?: string;
  loadContexts: () => Promise<void>;
  configurationRevision: number;
  targets: Target[];
  addTarget: (target: Target) => void;
  removeTarget: (target: Target) => void;
  clearTargets: () => void;
  namespaces: NamespaceInfo[];
  namespacesFor: string[];
  namespacesLoading: boolean;
  namespacesError?: string;
  children: (onEditorOpenChange: (open: boolean) => void) => ReactNode;
}

export function TargetSelectionPanel({
  contexts,
  contextsLoading,
  contextsError,
  loadContexts,
  configurationRevision,
  targets,
  addTarget,
  removeTarget,
  clearTargets,
  namespaces,
  namespacesFor,
  namespacesLoading,
  namespacesError,
  children,
}: TargetSelectionPanelProps) {
  const [namespace, setNamespace] = useState('');
  const [selectedNamespaces, setSelectedNamespaces] = useState<string[]>([]);
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const [contextFilter, setContextFilter] = useState('');
  const [presetEditorOpen, setPresetEditorOpen] = useState(false);

  useEffect(() => {
    setSelectedClusters([]);
    setSelectedNamespaces([]);
    setNamespace('');
    setContextFilter('');
  }, [configurationRevision]);

  const namespacesReady = selectedClusters.length > 0
    && !namespacesLoading
    && [...selectedClusters].sort().join('|') === namespacesFor.join('|');
  const model = useMemo(() => getTargetSelectionModel({
    contexts,
    contextFilter,
    selectedClusters,
    selectedNamespaces,
    namespace,
    namespaces,
    namespacesReady,
    namespacesError,
  }), [contextFilter, contexts, namespace, namespaces, namespacesError, namespacesReady, selectedClusters, selectedNamespaces]);
  const manualNamespaceFallback = canUseManualNamespace(namespaces, namespacesReady, namespacesError);

  const toggleCluster = (name: string) => {
    setSelectedNamespaces([]);
    setNamespace('');
    setSelectedClusters((current) => current.includes(name)
      ? current.filter((cluster) => cluster !== name)
      : [...current, name]);
  };

  const toggleVisibleClusters = () => {
    const visibleNames = model.visibleContexts.map((context) => context.name);
    setSelectedNamespaces([]);
    setNamespace('');
    setSelectedClusters((current) => model.allVisibleClustersSelected
      ? current.filter((cluster) => !visibleNames.includes(cluster))
      : [...new Set([...current, ...visibleNames])]);
  };

  const selectNamespace = (name: string) => {
    const next = name.trim();
    if (!hasExactNamespaceMatch(namespaces, next) && !manualNamespaceFallback) return;
    setSelectedNamespaces((current) => current.includes(next) ? current : [...current, next]);
    setNamespace('');
  };

  const removeNamespace = (name: string) => {
    setSelectedNamespaces((current) => current.filter((item) => item !== name));
  };

  const addSelection = () => {
    if (!model.canAdd) return;
    for (const target of buildAvailableTargets(selectedClusters, model.namespacesToAdd, namespaces, manualNamespaceFallback)) {
      addTarget(target);
    }
    setSelectedClusters([]);
    setSelectedNamespaces([]);
    setNamespace('');
    setContextFilter('');
  };

  return (
    <div className="sidebar-content">
      <div className="sidebar-heading">
        <div><span className="eyebrow">Targets</span><h1>Clusters & namespaces</h1></div>
        <button type="button" className="icon-button subtle" title="Reload contexts from kubeconfig" aria-label="Reload contexts from kubeconfig" onClick={() => void loadContexts()}><RefreshCw size={15} /></button>
      </div>

      <KubeconfigSetup />

      <label className="sidebar-search">
        <Search size={14} />
        <span className="visually-hidden">Filter contexts</span>
        <input value={contextFilter} onChange={(event) => setContextFilter(event.target.value)} placeholder="Filter contexts..." aria-label="Filter contexts" />
      </label>

      <div className="sidebar-section-label">
        <span>Contexts <b>{contexts.length}</b></span>
        {selectedClusters.length > 0 && <span>{selectedClusters.length} sel.</span>}
        <button type="button" className="text-button selection-action" onClick={toggleVisibleClusters} disabled={model.visibleContexts.length === 0 || contextsLoading}>{model.allVisibleClustersSelected ? 'Clear all' : contextFilter.trim() ? 'Select visible' : 'Select all'}</button>
      </div>

      {contextsError && <div className="sidebar-feedback"><ErrorState message={contextsError} onRetry={() => void loadContexts()} /></div>}
      {contextsLoading && <div className="sidebar-feedback"><LoadingState message="Loading contexts..." /></div>}

      <div className="context-list" role="group" aria-label="Available contexts">
        {model.visibleContexts.map((context) => {
          const active = selectedClusters.includes(context.name);
          const namespaceUnavailable = active && namespacesReady && model.unavailableClusters.includes(context.name);
          return (
            <button type="button" key={context.name} className={`context-item ${active ? 'is-active' : ''} ${namespaceUnavailable ? 'is-unavailable' : ''}`} onClick={() => toggleCluster(context.name)} aria-pressed={active} aria-label={`${context.name}${namespaceUnavailable ? ' (namespace unavailable)' : ''}`} title={namespaceUnavailable ? 'The selected namespace is not available in this cluster' : undefined}>
              <span className="context-check" aria-hidden="true">{active ? <Layers size={12} /> : null}</span>
              <span className="context-name">{context.name}</span>
              {namespaceUnavailable && <span className="context-warning" aria-hidden="true"><AlertTriangle size={12} /></span>}
            </button>
          );
        })}
        {!contextsLoading && model.visibleContexts.length === 0 && <p className="sidebar-hint">No context matches the filter.</p>}
      </div>

      <div className="namespace-row">
        <NamespaceInput value={namespace} onChange={setNamespace} selectedClusters={selectedClusters} selectedNamespaces={selectedNamespaces} onSelectNamespace={selectNamespace} onRemoveNamespace={removeNamespace} showError={!presetEditorOpen} />
        <button type="button" className="primary-button add-target-button" onClick={addSelection} disabled={!model.canAdd} title={model.canAdd ? 'Add available cluster and namespace targets; unavailable pairs are skipped' : 'Select at least one namespace from the suggestions'}><Plus size={15} /> Add</button>
        {model.namespacesToAdd.length > 0 && namespacesReady && <p className={`namespace-coverage-summary ${model.unavailableTargetCount > 0 ? 'is-partial' : ''}`}>{model.unavailableTargetCount > 0 ? `${model.availableTargetCount} target(s) available · ${model.unavailableClusters.length} cluster(s) skipped because the namespace is unavailable` : 'Namespace available in all selected clusters'}</p>}
      </div>

      <div className="sidebar-section-label">
        <span>Selected targets <b>{targets.length}</b></span>
        {targets.length > 0 && <button type="button" className="text-button" onClick={clearTargets}>Clear</button>}
      </div>
      <div className="target-list">
        {targets.map((target) => <div className="target-chip" key={targetKey(target)}><span className="target-chip-text"><strong>{target.cluster}</strong><small>{target.namespace}</small></span><button type="button" className="icon-button subtle danger" title={`Remove ${targetKey(target)}`} aria-label={`Remove target ${targetKey(target)}`} onClick={() => removeTarget(target)}><X size={13} /></button></div>)}
        {targets.length === 0 && <p className="sidebar-hint">Pick contexts, type a namespace and add them to build the unified view.</p>}
      </div>
      {children(setPresetEditorOpen)}
    </div>
  );
}