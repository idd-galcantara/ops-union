import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Layers, RefreshCw, Search, X } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from './Feedback';
import {
  applySidecarAction,
  defaultSelectionKeys,
  inventoryContextKey,
  inventoryHasSources,
  inventorySourceKey,
  reconcileSelectionKeys,
  scopedIssueText,
  selectionFromKeys,
  sidecarSourceKeys,
} from '../logSourceInventory';
import { canConfirmLogSelection, modalSelectionCount } from '../logSourceModal';
import type {
  ApplicationLogInventory,
  InventoryContext,
  InventoryPod,
  LogSourceSelection,
  Target,
} from '../types';

interface ApplicationLogSourceModalProps {
  inventory?: ApplicationLogInventory;
  originatingContext: Pick<Target, 'cluster' | 'namespace'>;
  initialSelectedKeys?: string[];
  loading: boolean;
  stale: boolean;
  error?: string;
  onRefresh: () => void;
  onCancel: () => void;
  onConfirm: (selection: LogSourceSelection[]) => void;
}

export function ApplicationLogSourceModal({
  inventory,
  originatingContext,
  initialSelectedKeys,
  loading,
  stale,
  error,
  onRefresh,
  onCancel,
  onConfirm,
}: ApplicationLogSourceModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() =>
    initialSelectedKeys ? new Set(initialSelectedKeys) : inventory ? defaultSelectionKeys(inventory) : new Set(),
  );
  const [expandedContexts, setExpandedContexts] = useState<Set<string>>(() => new Set());
  const [expandedPods, setExpandedPods] = useState<Set<string>>(() => new Set());
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const previousApplicationKey = useRef(inventory?.application.key);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  useEffect(() => {
    if (!inventory) return;
    const sameApplication = previousApplicationKey.current === inventory.application.key;
    setSelectedKeys((current) => sameApplication
      ? reconcileSelectionKeys(inventory, current)
      : initialSelectedKeys
        ? new Set(initialSelectedKeys)
      : defaultSelectionKeys(inventory));
    previousApplicationKey.current = inventory.application.key;
    setExpandedContexts(new Set(inventory.contexts.map(inventoryContextKey)));
    setExpandedPods(new Set());
  }, [inventory, originatingContext, initialSelectedKeys]);

  if (!inventory && loading) {
    return <ModalFrame dialogRef={dialogRef}><LoadingState message="Loading application sources..." /></ModalFrame>;
  }

  const selectedCount = modalSelectionCount(inventory, selectedKeys);
  const visibleContexts = inventory?.contexts.filter((context) => contextMatches(context, search)) ?? [];
  const canConfirm = canConfirmLogSelection(inventory, selectedKeys, { loading, stale });
  const allSidecarKeys = inventory ? sidecarSourceKeys(inventory) : [];
  const selectedSidecarCount = allSidecarKeys.filter((key) => selectedKeys.has(key)).length;
  const primaryCount = inventory ? inventory.contexts.flatMap((context) => context.pods.flatMap((pod) => pod.containers)).filter((container) => container.role !== 'sidecar').length : 0;
  const sidecarCount = allSidecarKeys.length;
  const fallbackCount = inventory?.contexts.reduce((count, context) => count + context.sidecarOnlyPods.length, 0) ?? 0;
  const selectedPodCount = inventory ? new Set(selectionFromKeys(inventory, selectedKeys).map((source) => `${source.cluster}\u0000${source.namespace}\u0000${source.pod}`)).size : 0;

  const toggleKeys = (keys: string[]) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      const shouldSelect = keys.some((key) => !next.has(key));
      for (const key of keys) {
        if (shouldSelect) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

  const visibleKeys = inventory ? sourceKeysForContexts(visibleContexts, inventory.application.key) : [];
  const applicationSelected = visibleKeys.length > 0 && visibleKeys.every((key) => selectedKeys.has(key));
  const toggleVisibleSources = () => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (applicationSelected) visibleKeys.forEach((key) => next.delete(key));
      else visibleKeys.forEach((key) => next.add(key));
      return next;
    });
  };
  const updateSidecars = (scope: 'application' | InventoryContext, include: boolean) => {
    if (!inventory) return;
    setSelectedKeys((current) => applySidecarAction(inventory, current, scope === 'application' ? 'application' : scope, include));
  };

  return (
    <ModalFrame dialogRef={dialogRef}>
      <header className="source-modal-header">
        <div>
          <span className="eyebrow">Log sources</span>
          <h2 id="log-source-modal-title">{inventory?.application.name ?? 'Application'} sources</h2>
          {inventory && <p className="source-modal-identity">Identity: {inventory.application.key}</p>}
        </div>
        <button type="button" className="icon-button subtle" onClick={onCancel} aria-label="Cancel source selection" title="Cancel">
          <X size={17} />
        </button>
      </header>

      {inventory && <section className="source-scope-summary" aria-label="Application log source scope">
        <div className="source-scope-identity">
          <span className="eyebrow">Application identity</span>
          <strong>{inventory.application.name}</strong>
          <code>{inventory.application.key}</code>
        </div>
        <div className="source-scope-contexts">
          <span className="summary-label">Consulted contexts ({inventory.consultedContexts.length})</span>
          {inventory.consultedContexts.map((context) => <span key={inventoryContextKey(context)}>{context.cluster} / {context.namespace}</span>)}
        </div>
        <div className="source-scope-stats" aria-label="Selection counts">
          <span><strong>{selectedPodCount}</strong> selected pods</span>
          <span><strong>{selectedCount}</strong> selected containers</span>
          <span><strong>{primaryCount}</strong> primary/unknown available</span>
          <span><strong>{sidecarCount}</strong> sidecars available</span>
          {fallbackCount > 0 && <span><strong>{fallbackCount}</strong> sidecar-only fallback</span>}
        </div>
        <div className="source-scope-actions" aria-label="Application sidecar actions">
          <span>{selectedSidecarCount} of {sidecarCount} sidecars selected</span>
          <button type="button" className="secondary-button" disabled={sidecarCount === 0} onClick={() => updateSidecars('application', selectedSidecarCount !== sidecarCount)}>
            {selectedSidecarCount === sidecarCount ? 'Exclude all sidecars' : `Include all sidecars (${sidecarCount - selectedSidecarCount})`}
          </button>
        </div>
        <div className="source-scope-state" role="status" aria-live="polite">
          {loading && 'Loading current inventory.'}
          {!loading && stale && 'Inventory is stale. Refresh before confirming.'}
          {!loading && !stale && inventory.issues.length > 0 && 'Partial discovery. Review affected contexts before confirming.'}
          {!loading && !stale && inventory.issues.length === 0 && !inventoryHasSources(inventory) && 'No eligible sources found in the consulted contexts.'}
          {!loading && !stale && inventory.issues.length === 0 && inventoryHasSources(inventory) && 'Inventory ready for review.'}
        </div>
      </section>}

      {loading && <LoadingState message="Refreshing pod inventory..." />}
      {error && <ErrorState message={error} onRetry={onRefresh} />}
      {stale && <p className="source-modal-warning" role="alert">The pod inventory changed. Refresh before confirming sources.</p>}
      {inventory?.issues.length ? (
        <div className="source-modal-partial" role="status" aria-live="polite">
          <strong>Some sources could not be discovered.</strong>
          {inventory.issues.map((issue, index) => <span key={`${issue.message}-${index}`}>{scopedIssueText(issue)}</span>)}
        </div>
      ) : null}

      {!loading && inventory && !inventoryHasSources(inventory) && (
        <EmptyState icon={<Layers size={21} />} title="No eligible sources" description="Refresh the pod inventory or choose another application." action={<button type="button" className="secondary-button" onClick={onRefresh}><RefreshCw size={13} /> Refresh inventory</button>} />
      )}
      {!loading && inventory && <details className="source-details" open={detailsExpanded} onToggle={(event) => setDetailsExpanded(event.currentTarget.open)}>
        <summary>Review pod and container details <span>{selectedCount} selected</span></summary>
        <div className="source-modal-toolbar">
          <label className="source-modal-search">
            <span>Search sources</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Context, pod, or container" />
          </label>
          <button type="button" className="text-button source-selection-action" onClick={toggleVisibleSources} disabled={visibleKeys.length === 0}>
            {applicationSelected ? 'Clear all' : search.trim() ? 'Select visible' : 'Select all'}
          </button>
          <span className="source-modal-count" role="status" aria-live="polite">{selectedCount} selected</span>
        </div>
        {inventoryHasSources(inventory) && visibleContexts.length === 0 && (
          <EmptyState icon={<Search size={21} />} title="No matching sources" description="Clear the search to see the available contexts." />
        )}
        {inventoryHasSources(inventory) && visibleContexts.length > 0 && <div className="source-tree" role="tree" aria-label="Application log source hierarchy">
          <div className="source-tree-root" role="treeitem" aria-expanded="true">
            <button type="button" className="tree-disclosure is-static" aria-hidden="true"><ChevronDown size={14} /></button>
            <input type="checkbox" checked={applicationSelected} ref={(element) => { if (element) element.indeterminate = !applicationSelected && visibleKeys.some((key) => selectedKeys.has(key)); }} onChange={() => toggleKeys(visibleKeys)} aria-label={`Select sources for application ${inventory.application.name}`} />
            <strong>{inventory.application.name}</strong>
            <span className="source-tree-count">{selectedCount} selected</span>
          </div>
          {visibleContexts.map((context) => <ContextNode key={inventoryContextKey(context)} context={context} selectedKeys={selectedKeys} expandedContexts={expandedContexts} expandedPods={expandedPods} search={search} onToggleKeys={toggleKeys} onToggleContext={(key) => setExpandedContexts((current) => toggleSet(current, key))} onTogglePod={(key) => setExpandedPods((current) => toggleSet(current, key))} onSidecarAction={(include) => updateSidecars(context, include)} />)}
        </div>
        }
      </details>}

      <footer className="source-modal-footer">
        <span className="source-modal-footer-note">{stale ? 'Refresh required before starting logs.' : selectedCount === 0 ? 'Select at least one container.' : `${selectedCount} container source(s) ready.`}</span>
        <div className="source-modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary-button" disabled={!canConfirm} onClick={() => inventory && onConfirm(selectionFromKeys(inventory, selectedKeys))}><Check size={14} /> Confirm sources</button>
        </div>
      </footer>
    </ModalFrame>
  );
}

function ContextNode({
  context,
  selectedKeys,
  expandedContexts,
  expandedPods,
  search,
  onToggleKeys,
  onToggleContext,
  onTogglePod,
  onSidecarAction,
}: {
  context: InventoryContext;
  selectedKeys: ReadonlySet<string>;
  expandedContexts: ReadonlySet<string>;
  expandedPods: ReadonlySet<string>;
  search: string;
  onToggleKeys: (keys: string[]) => void;
  onToggleContext: (key: string) => void;
  onTogglePod: (key: string) => void;
  onSidecarAction: (include: boolean) => void;
}) {
  const contextKey = inventoryContextKey(context);
  const pods = context.pods.filter((pod) => podMatches(pod, search));
  const keys = pods.flatMap((pod) => pod.containers.map((container) => inventorySourceKey({ cluster: context.cluster, namespace: context.namespace, pod: pod.pod, container: container.container })));
  const selected = keys.filter((key) => selectedKeys.has(key)).length;
  const sidecarKeys = sidecarSourceKeys({ application: { key: '', name: '', source: 'pod' }, consultedContexts: [context], contexts: [context], issues: [] });
  const selectedSidecars = sidecarKeys.filter((key) => selectedKeys.has(key)).length;
  const expanded = expandedContexts.has(contextKey);
  return (
    <div className="source-tree-context" role="treeitem" aria-expanded={expanded}>
      <div className="source-tree-row source-tree-context-row">
        <button type="button" className="tree-disclosure" onClick={() => onToggleContext(contextKey)} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${context.cluster}/${context.namespace}`} aria-expanded={expanded}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
        <input type="checkbox" checked={keys.length > 0 && selected === keys.length} ref={(element) => { if (element) element.indeterminate = selected > 0 && selected < keys.length; }} onChange={() => onToggleKeys(keys)} aria-label={`Select context ${context.cluster}/${context.namespace}`} />
        <strong>{context.cluster} / {context.namespace}</strong>
        <span className="source-tree-count">{selected}/{keys.length} containers · {context.pods.length} pods</span>
        {sidecarKeys.length > 0 && <button type="button" className="text-button source-context-sidecars" onClick={() => onSidecarAction(selectedSidecars !== sidecarKeys.length)} aria-label={`${selectedSidecars === sidecarKeys.length ? 'Exclude' : 'Include'} sidecars in ${context.cluster}/${context.namespace}`}>
          {selectedSidecars === sidecarKeys.length ? 'Exclude' : 'Include'} sidecars ({sidecarKeys.length - (selectedSidecars === sidecarKeys.length ? 0 : selectedSidecars)})
        </button>}
      </div>
      {expanded && <div className="source-tree-children">{pods.map((pod) => <PodNode key={`${contextKey}\u0000${pod.pod}`} context={context} pod={pod} selectedKeys={selectedKeys} expandedPods={expandedPods} onToggleKeys={onToggleKeys} onTogglePod={onTogglePod} />)}</div>}
    </div>
  );
}

function PodNode({
  context,
  pod,
  selectedKeys,
  expandedPods,
  onToggleKeys,
  onTogglePod,
}: {
  context: InventoryContext;
  pod: InventoryPod;
  selectedKeys: ReadonlySet<string>;
  expandedPods: ReadonlySet<string>;
  onToggleKeys: (keys: string[]) => void;
  onTogglePod: (key: string) => void;
}) {
  const podKey = `${inventoryContextKey(context)}\u0000${pod.pod}`;
  const keys = pod.containers.map((container) => inventorySourceKey({ cluster: context.cluster, namespace: context.namespace, pod: pod.pod, container: container.container }));
  const selected = keys.filter((key) => selectedKeys.has(key)).length;
  const expanded = expandedPods.has(podKey);
  const fallback = context.sidecarOnlyPods.includes(pod.pod);
  return (
    <div className="source-tree-pod" role="treeitem" aria-expanded={expanded}>
      <div className="source-tree-row">
        <button type="button" className="tree-disclosure" onClick={() => onTogglePod(podKey)} aria-label={`${expanded ? 'Collapse' : 'Expand'} pod ${pod.pod}`} aria-expanded={expanded}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
        <input type="checkbox" checked={keys.length > 0 && selected === keys.length} ref={(element) => { if (element) element.indeterminate = selected > 0 && selected < keys.length; }} onChange={() => onToggleKeys(keys)} aria-label={`Select pod ${pod.pod}`} />
        <span className="source-tree-label"><strong>{pod.pod}</strong>{fallback && <small className="source-fallback">sidecar-only fallback</small>}</span>
        <span className="source-tree-count">{selected}/{keys.length}</span>
      </div>
      {expanded && <div className="source-tree-children source-container-list">{pod.containers.map((container) => { const key = inventorySourceKey({ cluster: context.cluster, namespace: context.namespace, pod: pod.pod, container: container.container }); return <label className="source-tree-container" key={key}><input type="checkbox" checked={selectedKeys.has(key)} onChange={() => onToggleKeys([key])} /><span>{container.container}</span><small className={`role-${container.role}`}>{container.role}{container.roleReason ? ` · ${container.roleReason}` : ''}</small></label>; })}</div>}
    </div>
  );
}

function ModalFrame({ dialogRef, children }: { dialogRef: React.RefObject<HTMLDivElement | null>; children: React.ReactNode }) {
  return <div className="source-modal-backdrop" role="presentation"><div className="source-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="log-source-modal-title" tabIndex={-1}>{children}</div></div>;
}

function toggleSet(current: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(current);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

function sourceKeysForContext(context: InventoryContext): string[] {
  return context.pods.flatMap((pod) => pod.containers.map((container) => inventorySourceKey({ cluster: context.cluster, namespace: context.namespace, pod: pod.pod, container: container.container })));
}

function sourceKeysForContexts(contexts: InventoryContext[], _applicationKey: string): string[] {
  return contexts.flatMap(sourceKeysForContext);
}

function contextMatches(context: InventoryContext, search: string): boolean {
  const needle = search.trim().toLowerCase();
  return !needle || `${context.cluster} ${context.namespace}`.toLowerCase().includes(needle) || context.pods.some((pod) => podMatches(pod, search));
}

function podMatches(pod: InventoryPod, search: string): boolean {
  const needle = search.trim().toLowerCase();
  return !needle || [pod.pod, ...pod.containers.map((container) => container.container)].join(' ').toLowerCase().includes(needle);
}