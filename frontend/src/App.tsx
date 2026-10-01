import { useEffect, useLayoutEffect, useState } from 'react';
import { ArrowRight, Bookmark, Layers, Moon, Search, Sun, Workflow } from 'lucide-react';
import { EmptyState, ErrorState } from './components/Feedback';
import { ApplicationLogSourceModal } from './components/ApplicationLogSourceModal';
import { LogViewer } from './components/LogViewer';
import { PodDetailsPanel } from './components/PodDetailsPanel';
import { PodTable, podRowKey } from './components/PodTable';
import { TargetErrorBanner } from './components/TargetErrorBanner';
import { TargetSelector, WorkspaceControls } from './components/TargetSelector';
import { ViewToolbar } from './components/ViewToolbar';
import { getQuickPresets } from './launchpad';
import { useAutoRefresh } from './useAutoRefresh';
import { useHealthStatus } from './useHealthStatus';
import { useLogSourceController } from './useLogSourceController';
import { usePodSelectionController } from './usePodSelectionController';
import { usePodViewData } from './podViewModel';
import { applyPresetAndLoad } from './presetFlow';
import { describePreset } from './presets';
import { useOpsFlowStore } from './store';
import { useResizablePanel } from './useResizablePanel';
import type { NormalizedPod } from './types';
import { useThemeController } from './useThemeController';

const DETAILS_MIN = 320;
const DETAILS_MAX = 900;
const DETAILS_DEFAULT = 420;
const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 520;
const SIDEBAR_DEFAULT = 292;
export default function App() {
  const health = useHealthStatus();
  const { theme, themeReady, toggleTheme } = useThemeController();
  const selection = usePodSelectionController();
  const [selectedApplications, setSelectedApplications] = useState<string[]>([]);
  const [presetLibraryRequest, setPresetLibraryRequest] = useState(0);
  const [viewResetRequest, setViewResetRequest] = useState(0);
  const [quickPresetId, setQuickPresetId] = useState<string | null>(null);

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
  const openPresetLibrary = () => setPresetLibraryRequest((request) => request + 1);

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

  const logController = useLogSourceController({
    pods,
    targets,
    targetErrors,
    lastUpdatedAt,
    selected: selection.selected,
    selectedLogPods: selection.selectedLogPods,
    onSelectLogPods: selection.openLogPods,
    onSetLogPods: selection.setLogPods,
    onSetDetailsInitialTab: selection.setDetailsInitialTab,
    podsLoading,
    podsError,
    refreshPods: () => void loadPods({ resetView: false }),
  });

  const openPod = (pod: NormalizedPod) => {
    selection.openPod(pod);
    logController.resetLogState();
  };

  const resetView = () => {
    clearTargets();
    selection.clearSelection();
    logController.resetLogState();
    setQuickPresetId(null);
    setViewResetRequest((request) => request + 1);
  };

  useLayoutEffect(() => {
    if (explicitQueryRevision === 0 && configurationRevision === 0) return;
    selection.clearSelection();
    logController.resetLogState();
    setFilter('');
    setSelectedApplications([]);
  }, [configurationRevision, explicitQueryRevision, setFilter]);
  useAutoRefresh({ refreshSeconds, targetCount: targets.length, refresh: loadPods });
  const { applicationOptions, visiblePods, clusterCount, namespaceCount } = usePodViewData(pods, filter, selectedApplications);

  const { selected, selectedLogPods, detailsInitialTab } = selection;
  const {
    logSources,
    logConsultedContexts,
    logModal,
    openCurrentLogSources,
    closeLogWorkspace,
    clearDetailsLogState,
    confirmLogSources,
    closeLogModal,
    refreshInventory,
    inventoryLoading,
    inventoryError,
  } = logController;

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
        <WorkspaceControls onOpenPresetLibrary={openPresetLibrary} />
        <div className="topbar-actions">
          <button
            type="button"
            className={`theme-toggle ${theme === 'dark' ? 'is-dark' : ''}`}
            onClick={toggleTheme}
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
              </div>
            )}
          </div>

          {pods.length > 0 && (
            <ViewToolbar
              grouping={grouping}
              onGroupingChange={setGrouping}
              filter={filter}
              onFilterChange={setFilter}
              applications={applicationOptions}
              selectedApplications={selectedApplications}
              onSelectedApplicationsChange={setSelectedApplications}
              visibleCount={visiblePods.length}
              totalCount={pods.length}
              onRefresh={() => void loadPods({ resetView: false })}
              loading={podsLoading}
              refreshing={refreshing}
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              lastUpdatedAt={lastUpdatedAt}
            />
          )}

          <div className="panel-content">
            {podsError && <ErrorState message={podsError} onRetry={() => void loadPods({ resetView: false })} />}

            <TargetErrorBanner errors={targetErrors} />

            {pods.length > 0 && visiblePods.length > 0 && (
              <PodTable
                pods={visiblePods}
                grouping={grouping}
                selectedPod={selected ? podRowKey(selected) : undefined}
                onSelectPod={openPod}
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
              selection.clearSelection();
              clearDetailsLogState();
            }}
            resizing={details.resizing}
            onResizeStart={details.startResize}
            onResizeNudge={details.nudge}
          />
        )}
      </div>
      {logModal && <ApplicationLogSourceModal inventory={logModal.inventory} originatingContext={logModal.originatingContext} initialSelectedKeys={logModal.initialSelectedKeys} loading={inventoryLoading} stale={Boolean(logModal.inventory.snapshotAt && lastUpdatedAt && lastUpdatedAt > logModal.inventory.snapshotAt)} error={inventoryError} onRefresh={refreshInventory} onCancel={closeLogModal} onConfirm={confirmLogSources} />}
    </div>
  );
}
