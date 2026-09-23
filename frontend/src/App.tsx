import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ArrowRight, Bookmark, Layers, Moon, Search, ScrollText, Sun, Workflow } from 'lucide-react';
import { EmptyState, ErrorState } from './components/Feedback';
import { ApplicationLogSourceModal } from './components/ApplicationLogSourceModal';
import { LogViewer } from './components/LogViewer';
import { PodDetailsPanel } from './components/PodDetailsPanel';
import { PodTable, podRowKey } from './components/PodTable';
import { TargetErrorBanner } from './components/TargetErrorBanner';
import { TargetSelector } from './components/TargetSelector';
import { ViewToolbar } from './components/ViewToolbar';
import { getQuickPresets } from './launchpad';
import { matchesFilter } from './podPresentation';
import { applyPresetAndLoad } from './presetFlow';
import { describePreset } from './presets';
import { useOpsFlowStore } from './store';
import { useResizablePanel } from './useResizablePanel';
import { buildApplicationLogInventory, inventorySourceKey, selectionToLogSources } from './logSourceInventory';
import { applicationKeys, hasSingleApplicationKey } from './logSourceModal';
import type { ApplicationLogInventory, InventoryIssue, LogSource, LogSourceSelection, NormalizedPod, PodRef, Target } from './types';

type HealthState = 'loading' | 'ok' | 'error';

const DETAILS_MIN = 320;
const DETAILS_MAX = 900;
const DETAILS_DEFAULT = 420;
const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 520;
const SIDEBAR_DEFAULT = 292;
const THEME_STORAGE_KEY = 'ops-union.theme.v1';

type Theme = 'light' | 'dark';

interface LogModalState {
  inventory: ApplicationLogInventory;
  originatingContext: Pick<Target, 'cluster' | 'namespace'>;
  initialSelectedKeys?: string[];
}

function readStoredTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export default function App() {
  const [health, setHealth] = useState<HealthState>('loading');
  const [selected, setSelected] = useState<PodRef | null>(null);
  const [selectedPodKeys, setSelectedPodKeys] = useState<Set<string>>(new Set());
  const [selectedLogPods, setSelectedLogPods] = useState<PodRef[]>([]);
  const [logSources, setLogSources] = useState<LogSource[]>([]);
  const [logConsultedContexts, setLogConsultedContexts] = useState<Target[]>([]);
  const [logModal, setLogModal] = useState<LogModalState | null>(null);
  const [logSelectionError, setLogSelectionError] = useState<string | null>(null);
  const [detailsInitialTab, setDetailsInitialTab] = useState<'describe' | 'metrics' | 'logs'>('describe');
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  const [themeReady, setThemeReady] = useState(() => !Boolean(window.opsFlowDesktop));
  const [presetLibraryRequest, setPresetLibraryRequest] = useState(0);
  const [viewResetRequest, setViewResetRequest] = useState(0);
  const [quickPresetId, setQuickPresetId] = useState<string | null>(null);

  useEffect(() => {
    const desktop = window.opsFlowDesktop;
    if (!desktop) {
      setThemeReady(true);
      return;
    }

    let active = true;
    void desktop.loadTheme()
      .then((storedTheme) => {
        if (active && storedTheme) setTheme(storedTheme);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setThemeReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage can be unavailable in restricted browser profiles.
    }

    if (window.opsFlowDesktop) {
      void window.opsFlowDesktop.saveTheme(theme).catch(() => undefined);
    }
  }, [theme, themeReady]);

  const sidebar = useResizablePanel({
    storageKey: 'ops-union.sidebarWidth.v1',
    defaultWidth: SIDEBAR_DEFAULT,
    min: SIDEBAR_MIN,
    max: SIDEBAR_MAX,
    direction: 'left',
  });

  const details = useResizablePanel({
    storageKey: 'ops-union.detailsWidth.v1',
    defaultWidth: DETAILS_DEFAULT,
    min: DETAILS_MIN,
    max: DETAILS_MAX,
  });

  const openPod = (pod: NormalizedPod) => {
    setSelected({
      cluster: pod.cluster,
      namespace: pod.namespace,
      name: pod.name,
      containers: pod.containers,
      application: pod.application,
    });
    setSelectedLogPods([]);
    setLogSources([]);
    setLogConsultedContexts([]);
    setLogModal(null);
    setLogSelectionError(null);
    setDetailsInitialTab('describe');
    setSelectedPodKeys(new Set());
  };

  const toggleSelectedPod = (pod: NormalizedPod) => {
    const key = podRowKey(pod);
    setLogSelectionError(null);
    setSelectedPodKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const targets = useOpsFlowStore((s) => s.targets);
  const pods = useOpsFlowStore((s) => s.pods);
  const presets = useOpsFlowStore((s) => s.presets);
  const quickPresets = getQuickPresets(presets);
  const targetErrors = useOpsFlowStore((s) => s.targetErrors);
  const configurationRevision = useOpsFlowStore((s) => s.configurationRevision);
  const podsLoading = useOpsFlowStore((s) => s.podsLoading);
  const podsError = useOpsFlowStore((s) => s.podsError);
  const explicitQueryRevision = useOpsFlowStore((s) => s.explicitQueryRevision);
  const hasQueried = useOpsFlowStore((s) => s.hasQueried);
  const grouping = useOpsFlowStore((s) => s.grouping);
  const setGrouping = useOpsFlowStore((s) => s.setGrouping);
  const filter = useOpsFlowStore((s) => s.filter);
  const setFilter = useOpsFlowStore((s) => s.setFilter);
  const loadPods = useOpsFlowStore((s) => s.loadPods);
  const clearTargets = useOpsFlowStore((s) => s.clearTargets);
  const refreshing = useOpsFlowStore((s) => s.refreshing);
  const refreshSeconds = useOpsFlowStore((s) => s.refreshSeconds);
  const setRefreshSeconds = useOpsFlowStore((s) => s.setRefreshSeconds);
  const lastUpdatedAt = useOpsFlowStore((s) => s.lastUpdatedAt);
  const hydratePresets = useOpsFlowStore((s) => s.hydratePresets);
  const selectedPods = pods.filter((pod) => selectedPodKeys.has(podRowKey(pod)));
  const selectedApplicationCount = applicationKeys(selectedPods).size;

  const openLogModalFromPods = (sourcePods: NormalizedPod[], preserveCurrent = false) => {
    const first = sourcePods[0];
    if (!first) return;
    if (!hasSingleApplicationKey(sourcePods)) {
      setLogSelectionError('Select pods from one application at a time to open logs. Clear the current selection and choose pods from a single application.');
      return;
    }
    setLogSelectionError(null);
    const issues: InventoryIssue[] = targetErrors.map((item) => ({
      cluster: item.target.cluster,
      namespace: item.target.namespace,
      message: item.message,
    }));
    const inventory = buildApplicationLogInventory(pods, first.application, issues, lastUpdatedAt, targets);
    const currentKeys = preserveCurrent && logSources.length > 0 && logSources[0].application?.key === first.application.key
      ? logSources.map(inventorySourceKey)
      : undefined;
    setSelected({ cluster: first.cluster, namespace: first.namespace, name: first.name, containers: first.containers, application: first.application });
    setSelectedLogPods(sourcePods.map((pod) => ({ cluster: pod.cluster, namespace: pod.namespace, name: pod.name, containers: pod.containers, application: pod.application })));
    setLogModal({ inventory, originatingContext: { cluster: first.cluster, namespace: first.namespace }, initialSelectedKeys: currentKeys });
  };

  const openCombinedLogs = () => {
    openLogModalFromPods(selectedPods);
  };

  const openCurrentLogSources = () => {
    const sourcePods = selectedLogPods.length > 0
      ? pods.filter((item) => selectedLogPods.some((ref) => ref.cluster === item.cluster && ref.namespace === item.namespace && ref.name === item.name))
      : [pods.find((item) => item.cluster === selected?.cluster && item.namespace === selected?.namespace && item.name === selected?.name)].filter((item): item is NormalizedPod => Boolean(item));
    openLogModalFromPods(sourcePods, true);
  };

  const closeLogWorkspace = () => {
    setLogSources([]);
    setDetailsInitialTab('describe');
  };

  const confirmLogSources = (selection: LogSourceSelection[]) => {
    const confirmed = selectionToLogSources(selection);
    if (confirmed.length === 0) return;
    setLogSources(confirmed);
    setLogConsultedContexts(logModal?.inventory.consultedContexts ?? confirmed.map(({ cluster, namespace }) => ({ cluster, namespace })));
    setSelectedLogPods(pods
      .filter((pod) => confirmed.some((source) => source.cluster === pod.cluster && source.namespace === pod.namespace && source.pod === pod.name))
      .map((pod) => ({ cluster: pod.cluster, namespace: pod.namespace, name: pod.name, containers: pod.containers, application: pod.application })));
    setDetailsInitialTab('describe');
    setLogModal(null);
  };

  const openPresetLibrary = () => setPresetLibraryRequest((request) => request + 1);

  const resetView = () => {
    clearTargets();
    setSelected(null);
    setSelectedPodKeys(new Set());
    setSelectedLogPods([]);
    setLogSources([]);
    setLogConsultedContexts([]);
    setLogModal(null);
    setLogSelectionError(null);
    setQuickPresetId(null);
    setViewResetRequest((request) => request + 1);
  };

  const applyQuickPreset = (id: string) => {
    if (quickPresetId || podsLoading) return;
    if (!useOpsFlowStore.getState().presets.some((preset) => preset.id === id)) return;

    setQuickPresetId(id);
    void applyPresetAndLoad(id, useOpsFlowStore.getState, () => setQuickPresetId(null)).catch(
      () => setQuickPresetId(null),
    );
  };

  useEffect(() => {
    void hydratePresets();
  }, [hydratePresets]);

  useLayoutEffect(() => {
    if (explicitQueryRevision === 0 && configurationRevision === 0) return;
    setSelected(null);
    setSelectedPodKeys(new Set());
    setSelectedLogPods([]);
    setLogSources([]);
    setLogConsultedContexts([]);
    setLogModal(null);
    setLogSelectionError(null);
    setDetailsInitialTab('describe');
    setFilter('');
  }, [configurationRevision, explicitQueryRevision, setFilter]);

  useEffect(() => {
    if (!logModal || !lastUpdatedAt || logModal.inventory.snapshotAt === lastUpdatedAt) return;
    const application = logModal.inventory.application;
    const issues: InventoryIssue[] = targetErrors.map((item) => ({
      cluster: item.target.cluster,
      namespace: item.target.namespace,
      message: item.message,
    }));
    const inventory = buildApplicationLogInventory(pods, application, issues, lastUpdatedAt, targets);
    setLogModal((current) => {
      if (!current || current.inventory.application.key !== application.key) return current;
      return { ...current, inventory };
    });
  }, [lastUpdatedAt, logModal, pods, targetErrors]);

  // Auto-refresh: silent so the table keeps its content between ticks. Only runs
  // while there are targets, and is torn down on interval change or unmount.
  useEffect(() => {
    if (refreshSeconds <= 0 || targets.length === 0) return;
    const timer = setInterval(() => {
      void loadPods({ silent: true });
    }, refreshSeconds * 1000);
    return () => clearInterval(timer);
  }, [refreshSeconds, targets.length, loadPods]);

  useEffect(() => {
    let active = true;
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error();
        if (active) setHealth('ok');
      })
      .catch(() => {
        if (active) setHealth('error');
      });
    return () => {
      active = false;
    };
  }, []);

  const visiblePods = useMemo(() => pods.filter((p) => matchesFilter(p, filter)), [filter, pods]);

  const clusterCount = useMemo(() => new Set(pods.map((p) => p.cluster)).size, [pods]);
  const namespaceCount = useMemo(() => new Set(pods.map((p) => p.namespace)).size, [pods]);

  return (
    <div className="app-shell" data-theme={theme}>
      <header className="topbar">
        <button
          type="button"
          className="brand-lockup"
          onClick={resetView}
          aria-label="Return to the initial view"
          title="Return to the initial view"
        >
          <div className="brand-mark">
            <Workflow size={17} strokeWidth={2.5} />
          </div>
          <div>
            <strong>Ops Union</strong>
            <span>Kubernetes unified view</span>
          </div>
        </button>
        <div className="topbar-actions">
          <button
            type="button"
            className={`theme-toggle ${theme === 'dark' ? 'is-dark' : ''}`}
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            disabled={!themeReady}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-pressed={theme === 'dark'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span className="theme-toggle-icon" aria-hidden="true">
              {theme === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
            </span>
            <span className="theme-toggle-track" aria-hidden="true">
              <span className="theme-toggle-thumb" />
            </span>
          </button>
          <div
            className={`topbar-status ${
              health === 'ok' ? 'status-ok' : health === 'error' ? 'status-error' : 'status-loading'
            }`}
          >
            <span className="status-dot" />
            {health === 'ok' ? 'Read-only' : health === 'error' ? 'Backend offline' : 'Connecting...'}
          </div>
        </div>
      </header>

      <div
        className={`app-body ${selected ? 'has-details' : ''}`}
        /*
         * The width travels as a custom property rather than an inline
         * grid-template-columns: inline styles outrank media queries, which would
         * keep the three-column layout on narrow screens where it must collapse.
         */
        style={{
          ['--sidebar-width' as string]: `${sidebar.width}px`,
          ['--details-width' as string]: `${details.width}px`,
        }}
      >
        <TargetSelector
          openPresetsRequest={presetLibraryRequest}
          resetRequest={viewResetRequest}
          sidebarWidth={sidebar.width}
          sidebarMin={SIDEBAR_MIN}
          sidebarMax={SIDEBAR_MAX}
          resizing={sidebar.resizing}
          onResizeStart={sidebar.startResize}
          onResizeNudge={sidebar.nudge}
        />

        <section className={`main-panel ${logSources.length > 0 ? 'is-log-workspace' : ''}`}>
          {logSources.length > 0 ? (
            <LogViewer
              pod={selected ?? selectedLogPods[0]}
              pods={selectedLogPods}
              sources={logSources}
              consultedContexts={logConsultedContexts}
              onChangeSources={openCurrentLogSources}
              onClose={closeLogWorkspace}
            />
          ) : (
            <>
          <div className="panel-header">
            <div>
              <span className="eyebrow">Unified view</span>
              <h2>Pods</h2>
            </div>
            {pods.length > 0 && (
              <div className="panel-summary">
                <span>
                  <strong>{pods.length}</strong> pods
                </span>
                <span>
                  <strong>{clusterCount}</strong> cluster(s)
                </span>
                <span>
                  <strong>{namespaceCount}</strong> namespace(s)
                </span>
                {selectedPodKeys.size > 0 && (
                  <>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={openCombinedLogs}
                      disabled={selectedApplicationCount > 1}
                      aria-describedby={selectedApplicationCount > 1 ? 'combined-logs-selection-help' : undefined}
                      title={selectedApplicationCount > 1 ? 'Select pods from one application at a time' : 'Open logs'}
                    >
                      <ScrollText size={13} /> Open logs ({selectedPodKeys.size})
                    </button>
                    {(selectedApplicationCount > 1 || logSelectionError) && (
                      <p id="combined-logs-selection-help" className="panel-selection-warning" role="alert">
                        {logSelectionError ?? 'Selected pods belong to multiple applications. Clear the current selection and choose pods from a single application to open logs.'}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {pods.length > 0 && (
            <ViewToolbar
              grouping={grouping}
              onGroupingChange={setGrouping}
              filter={filter}
              onFilterChange={setFilter}
              visibleCount={visiblePods.length}
              totalCount={pods.length}
              onRefresh={() => void loadPods()}
              loading={podsLoading}
              refreshing={refreshing}
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              lastUpdatedAt={lastUpdatedAt}
            />
          )}

          <div className="panel-content">
            {podsError && <ErrorState message={podsError} onRetry={() => void loadPods()} />}

            <TargetErrorBanner errors={targetErrors} />

            {pods.length > 0 && visiblePods.length > 0 && (
              <PodTable
                pods={visiblePods}
                grouping={grouping}
                selectedPod={selected ? podRowKey(selected) : undefined}
                onSelectPod={openPod}
                selectedPods={selectedPodKeys}
                onTogglePod={toggleSelectedPod}
              />
            )}

            {pods.length > 0 && visiblePods.length === 0 && (
              <EmptyState
                icon={<Search size={21} />}
                title="No pod matches the filter"
                description="Adjust or clear the filter to see results."
              />
            )}

            {pods.length === 0 && !podsLoading && !podsError && (
              <EmptyState
                icon={<Layers size={21} />}
                title={
                  targets.length === 0
                    ? hasQueried
                      ? 'No pods found'
                      : presets.length > 0
                        ? 'Continue with a saved view'
                        : 'Build your unified view'
                    : hasQueried
                      ? 'No pods found'
                      : 'Ready to query'
                }
                description={
                  targets.length === 0
                    ? hasQueried
                      ? 'The queried targets returned no pods. Check the namespace you entered.'
                      : presets.length > 0
                        ? 'Open a saved preset to restore a target combination, or build a new view from the sidebar.'
                        : 'Pick one or more contexts, type a namespace and add the targets. You can combine several clusters and several namespaces in the same view.'
                    : hasQueried
                      ? 'The queried targets returned no pods. Check the namespace you entered.'
                      : 'Click "Fetch pods" to query the selected targets.'
                }
                action={
                  !hasQueried && targets.length === 0 ? (
                    <div className="launchpad-actions">
                      <button
                        type="button"
                        className="primary-button launchpad-primary"
                        onClick={openPresetLibrary}
                      >
                        <Bookmark size={14} /> Open presets
                      </button>
                      {presets.length > 0 && (
                        <div className="launchpad-presets" aria-label="Quick preset access">
                          <span className="launchpad-label">Quick access</span>
                          {quickPresets.map((preset) => (
                            <button
                              type="button"
                              className="launchpad-preset"
                              key={preset.id}
                              onClick={() => applyQuickPreset(preset.id)}
                              disabled={Boolean(quickPresetId) || podsLoading}
                              aria-busy={quickPresetId === preset.id}
                            >
                              <span>
                                <strong>{preset.name}</strong>
                                <small>{describePreset(preset)}</small>
                              </span>
                              <ArrowRight size={14} aria-hidden="true" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : !hasQueried && targets.length > 0 ? (
                    <button
                      type="button"
                      className="primary-button launchpad-primary"
                      onClick={() => void loadPods()}
                      disabled={podsLoading}
                    >
                      <Layers size={14} /> Fetch pods
                    </button>
                  ) : undefined
                }
              />
            )}

            {podsLoading && pods.length === 0 && (
              <EmptyState
                icon={<Layers size={21} />}
                title="Querying targets..."
                description={`Fetching pods from ${targets.length} target(s) in parallel.`}
              />
            )}
          </div>
            </>
          )}
        </section>

        {selected && (
          <PodDetailsPanel
            key={`${selected.cluster}/${selected.namespace}/${selected.name}/${selectedLogPods.map((pod) => pod.name).join(',')}/${logSources.map((source) => source.sourceId).join('|')}/${detailsInitialTab}`}
            pod={selected}
            logPods={selectedLogPods.length > 0 ? selectedLogPods : [selected]}
            logSources={logSources}
            initialTab={detailsInitialTab}
            showLogsTab={logSources.length === 0}
            onOpenLogs={openCurrentLogSources}
            onClose={() => {
              setSelected(null);
              setSelectedLogPods([]);
              setLogSources([]);
              setLogConsultedContexts([]);
              setSelectedPodKeys(new Set());
              setLogSelectionError(null);
            }}
            resizing={details.resizing}
            onResizeStart={details.startResize}
            onResizeNudge={details.nudge}
          />
        )}
      </div>
      {logModal && <ApplicationLogSourceModal inventory={logModal.inventory} originatingContext={logModal.originatingContext} initialSelectedKeys={logModal.initialSelectedKeys} loading={podsLoading} stale={Boolean(logModal.inventory.snapshotAt && lastUpdatedAt && lastUpdatedAt > logModal.inventory.snapshotAt)} error={podsError} onRefresh={() => void loadPods()} onCancel={() => setLogModal(null)} onConfirm={confirmLogSources} />}
    </div>
  );
}
