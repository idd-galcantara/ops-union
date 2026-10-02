import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Check,
  Download,
  FileUp,
  Layers,
  Loader,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { suggestNamespaces } from '../namespaceSuggestions';
import { getQuickPresets } from '../launchpad';
import { applyPresetAndLoad } from '../presetFlow';
import { getPresetSelectionState, reconcilePresetSelection, toggleVisiblePresetSelection } from '../presetSelection';
import { filterPresets, getPresetIds } from '../presetLibraryModel';
import {
  describePreset,
  type Preset,
} from '../presets';
import {
  buildTransferPlan,
  catalogForTransfer,
  entriesForTransfer,
  type TransferConflictStrategy,
  type TransferMode,
  type TransferPlan,
} from '../presetTransfer';
import {
  buildCopyPlan,
  entriesForCopy,
  type CopyConflictStrategy,
  type CopyPlan,
} from '../presetCopy';
import { useOpsFlowStore } from '../store';
import { targetKey, type NamespaceInfo } from '../types';
import { MAX_WORKSPACE_IMPORT_BYTES, MAX_WORKSPACE_NAME_LENGTH, parseWorkspaceImportFile, validateWorkspaceName, type Workspace, type WorkspaceImportResult } from '../workspaces';
import { areAllVisibleWorkspacesSelected, filterWorkspaces, getSelectedVisibleWorkspaceIds, type WorkspaceDeleteIntent } from '../workspaceViewModel';
import { DestructiveConfirmation } from './DestructiveConfirmation';
import { TargetSelectionPanel } from './TargetSelectionPanel';
import { PresetLibraryHeader } from './PresetLibraryHeader';
import { WorkspaceQuickControls } from './WorkspaceQuickControls';

interface TargetSelectorProps {
  openPresetsRequest: number;
  resetRequest: number;
  sidebarWidth: number;
  sidebarMin: number;
  sidebarMax: number;
  resizing: boolean;
  onResizeStart: (event: React.MouseEvent | React.TouchEvent) => void;
  onResizeNudge: (delta: number) => void;
}

const KEYBOARD_STEP = 24;

function useDialogFocus(
  open: boolean,
  dialogRef: React.RefObject<HTMLElement | null>,
  restoreFocusRef?: React.RefObject<HTMLElement | null>,
  initialFocusSelector?: string,
) {
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
    const first = initialFocusSelector
      ? dialog.querySelector<HTMLElement>(initialFocusSelector)
      : dialog.querySelector<HTMLElement>(focusableSelector);
    (first ?? dialog).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)];
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const firstFocusable = focusable[0];
      const lastFocusable = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    dialog.addEventListener('keydown', handleKeyDown);
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown);
      const restoreTarget = restoreFocusRef?.current ?? previousFocus;
      if (restoreTarget && document.contains(restoreTarget)) restoreTarget.focus();
    };
  }, [dialogRef, initialFocusSelector, open, restoreFocusRef]);
}

/**
 * Builds the list of (cluster, namespace) targets to query.
 *
 * Supports the core ops-union use case — the same namespace across several
 * clusters — and also multiple namespaces on the same cluster, since each
 * target is an independent pair.
 */
export function TargetSelector({
  openPresetsRequest,
  resetRequest,
  sidebarWidth,
  sidebarMin,
  sidebarMax,
  resizing,
  onResizeStart,
  onResizeNudge,
}: TargetSelectorProps) {
  const contexts = useOpsFlowStore((s) => s.contexts);
  const contextsLoading = useOpsFlowStore((s) => s.contextsLoading);
  const contextsError = useOpsFlowStore((s) => s.contextsError);
  const loadContexts = useOpsFlowStore((s) => s.loadContexts);
  const loadKubeconfigStatus = useOpsFlowStore((s) => s.loadKubeconfigStatus);
  const configurationRevision = useOpsFlowStore((s) => s.configurationRevision);
  const targets = useOpsFlowStore((s) => s.targets);
  const addTarget = useOpsFlowStore((s) => s.addTarget);
  const removeTarget = useOpsFlowStore((s) => s.removeTarget);
  const clearTargets = useOpsFlowStore((s) => s.clearTargets);
  const loadPods = useOpsFlowStore((s) => s.loadPods);
  const podsLoading = useOpsFlowStore((s) => s.podsLoading);
  const namespaces = useOpsFlowStore((s) => s.namespaces);
  const namespacesFor = useOpsFlowStore((s) => s.namespacesFor);
  const namespacesLoading = useOpsFlowStore((s) => s.namespacesLoading);
  const namespacesError = useOpsFlowStore((s) => s.namespacesError);

  useEffect(() => {
    void loadContexts();
  }, [loadContexts]);

  useEffect(() => {
    void loadKubeconfigStatus();
  }, [loadKubeconfigStatus]);

  return (
    <aside className="sidebar">
      <div className={`sidebar-resize-handle ${resizing ? 'is-resizing' : ''}`} onMouseDown={onResizeStart} onTouchStart={onResizeStart} onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onResizeNudge(-KEYBOARD_STEP);
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          onResizeNudge(KEYBOARD_STEP);
        }
      }} role="separator" aria-orientation="vertical" aria-label="Resize targets panel" aria-valuemin={sidebarMin} aria-valuemax={sidebarMax} aria-valuenow={Math.round(sidebarWidth)} tabIndex={0} />
      <TargetSelectionPanel
        contexts={contexts}
        contextsLoading={contextsLoading}
        contextsError={contextsError}
        loadContexts={loadContexts}
        configurationRevision={configurationRevision}
        targets={targets}
        addTarget={addTarget}
        removeTarget={removeTarget}
        clearTargets={clearTargets}
        namespaces={namespaces}
        namespacesFor={namespacesFor}
        namespacesLoading={namespacesLoading}
        namespacesError={namespacesError}
      >{(onEditorOpenChange) => <PresetSection openRequest={openPresetsRequest} resetRequest={resetRequest} onEditorOpenChange={onEditorOpenChange} />}</TargetSelectionPanel>
      <div className="sidebar-footer">
        <button
          type="button"
          className="primary-button query-button"
          onClick={() => void loadPods()}
          disabled={targets.length === 0 || podsLoading}
        >
          {podsLoading ? (
            <>
              <RefreshCw size={15} className="spinning" /> Querying...
            </>
          ) : (
            <>
              <Layers size={15} /> Fetch pods
            </>
          )}
        </button>
        {targets.length > 1 && (
          <p className="sidebar-hint centered">
            {targets.length} targets will be queried in parallel
          </p>
        )}
      </div>
    </aside>
  );
}

/**
 * Saved target combinations, so a recurring investigation (e.g. "Example preset =
 * cluster-a + cluster-b") can be restored in one click instead of rebuilt every time.
 */
function PresetSection({
  openRequest,
  resetRequest,
  onEditorOpenChange,
}: {
  openRequest: number;
  resetRequest: number;
  onEditorOpenChange: (open: boolean) => void;
}) {
  const presets = useOpsFlowStore((s) => s.presets);
  const targets = useOpsFlowStore((s) => s.targets);
  const contexts = useOpsFlowStore((s) => s.contexts);
  const activeWorkspace = useOpsFlowStore((s) => s.workspaces.find((workspace) => workspace.id === s.activeWorkspaceId));
  const savePreset = useOpsFlowStore((s) => s.savePreset);
  const updatePreset = useOpsFlowStore((s) => s.updatePreset);
  const activePresetId = useOpsFlowStore((s) => s.activePresetId);
  const activePresetDirty = useOpsFlowStore((s) => s.activePresetDirty);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [creatingPreset, setCreatingPreset] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [applyingPresetId, setApplyingPresetId] = useState<string | null>(null);
  const contextNames = useMemo(() => contexts.map((context) => context.name), [contexts]);

  useEffect(() => {
    onEditorOpenChange(creatingPreset || editingPresetId !== null);
  }, [creatingPreset, editingPresetId, onEditorOpenChange]);

  const openLibrary = (saveCurrent = false) => {
    setCreatingPreset(saveCurrent);
    setLibraryOpen(!saveCurrent);
  };

  useEffect(() => {
    if (openRequest > 0) openLibrary();
  }, [openRequest]);

  useEffect(() => {
    if (resetRequest === 0) return;
    setLibraryOpen(false);
    setCreatingPreset(false);
    setEditingPresetId(null);
    setApplyingPresetId(null);
  }, [resetRequest]);

  return (
    <>
      <section className="preset-section preset-launcher" aria-label="Presets">
        <div className="preset-launcher-row">
          <button type="button" className="preset-launcher-button" onClick={() => openLibrary()}>
            <Bookmark size={13} />
            <span>
              Presets <b>{presets.length}</b>
            </span>
            <Search size={12} className="preset-launcher-search-icon" />
          </button>
          {targets.length > 0 && (
            <button type="button" className="text-button" onClick={() => openLibrary(true)}>
              Save as new
            </button>
          )}
        </div>
      </section>

      {libraryOpen && (
        <PresetLibrary
          presets={presets}
          activeWorkspaceId={activeWorkspace?.id ?? ''}
          activePresetId={activePresetId}
          activePresetDirty={activePresetDirty}
          applyingPresetId={applyingPresetId}
          onClose={() => {
            if (editingPresetId || creatingPreset || applyingPresetId) return;
            setLibraryOpen(false);
            setCreatingPreset(false);
          }}
          onApply={(id) => {
            if (applyingPresetId) return;
            if (!useOpsFlowStore.getState().presets.some((preset) => preset.id === id)) return;
            setApplyingPresetId(id);
            void applyPresetAndLoad(id, useOpsFlowStore.getState, () => {
              setApplyingPresetId(null);
              setLibraryOpen(false);
            }).catch(() => undefined);
          }}
          onEdit={(id) => {
            if (applyingPresetId) return;
            setEditingPresetId(id);
          }}
          workspaceName={activeWorkspace?.name ?? 'Active Workspace'}
        />
      )}

      {editingPresetId && (
        <PresetEditor
          mode="edit"
          preset={presets.find((preset) => preset.id === editingPresetId) ?? null}
          contexts={contextNames}
          onClose={() => setEditingPresetId(null)}
          onSave={(preset) => {
            if (!useOpsFlowStore.getState().presets.some((item) => item.id === preset.id)) return;
            updatePreset(preset.id, preset.name, preset.description ?? '', preset.targets);
            setEditingPresetId(null);
          }}
        />
      )}
      {creatingPreset && (
        <PresetEditor
          mode="create"
          preset={{ id: '', name: '', description: '', targets: targets.map((target) => ({ ...target })) }}
          presets={presets}
          contexts={contextNames}
          onClose={() => setCreatingPreset(false)}
          onSave={(preset) => {
            const createdId = savePreset(preset.name, preset.description ?? '', preset.targets);
            setCreatingPreset(false);
            setLibraryOpen(false);
            if (!createdId) return;
            void applyPresetAndLoad(createdId, useOpsFlowStore.getState, () => undefined).catch(() => undefined);
          }}
        />
      )}
    </>
  );
}

type BundleConflictStrategy = 'overwrite' | 'skip' | 'resolve';

export function WorkspaceControls({ onOpenPresetLibrary }: { onOpenPresetLibrary: () => void }) {
  const workspaces = useOpsFlowStore((state) => state.workspaces);
  const activeWorkspaceId = useOpsFlowStore((state) => state.activeWorkspaceId);
  const presets = useOpsFlowStore((state) => state.presets);
  const activePresetId = useOpsFlowStore((state) => state.activePresetId);
  const activePresetDirty = useOpsFlowStore((state) => state.activePresetDirty);
  const targets = useOpsFlowStore((state) => state.targets);
  const switchWorkspace = useOpsFlowStore((state) => state.switchWorkspace);
  const createWorkspace = useOpsFlowStore((state) => state.createWorkspace);
  const renameWorkspace = useOpsFlowStore((state) => state.renameWorkspace);
  const deleteWorkspace = useOpsFlowStore((state) => state.deleteWorkspace);
  const deleteWorkspaces = useOpsFlowStore((state) => state.deleteWorkspaces);
  const importWorkspace = useOpsFlowStore((state) => state.importWorkspace);
  const exportWorkspaces = useOpsFlowStore((state) => state.exportWorkspaces);
  const updatePreset = useOpsFlowStore((state) => state.updatePreset);
  const podsLoading = useOpsFlowStore((state) => state.podsLoading);
  const active = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];
  const [open, setOpen] = useState(false);
  const [workspaceEditor, setWorkspaceEditor] = useState<{ mode: 'create' } | { mode: 'rename'; workspaceId: string } | null>(null);
  const [, setStatus] = useState<string | null>(null);
  const [workspaceManagerError, setWorkspaceManagerError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<WorkspaceImportResult | null>(null);
  const [importCandidates, setImportCandidates] = useState<WorkspaceImportResult[] | null>(null);
  const [importName, setImportName] = useState('');
  const [activateImport, setActivateImport] = useState(false);
  const [fileOperation, setFileOperation] = useState<'importing' | 'exporting' | null>(null);
  const [workspaceQuery, setWorkspaceQuery] = useState('');
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[]>([]);
  const [selectedImportIndexes, setSelectedImportIndexes] = useState<number[]>([]);
  const [importQuery, setImportQuery] = useState('');
  const [activeImportIndex, setActiveImportIndex] = useState<number | null>(null);
  const [importConflictIndexes, setImportConflictIndexes] = useState<number[] | null>(null);
  const [conflictResolutionPosition, setConflictResolutionPosition] = useState<number | null>(null);
  const [conflictResolutionNames, setConflictResolutionNames] = useState<Record<number, string>>({});
  const [conflictResolutionSkipped, setConflictResolutionSkipped] = useState<Set<number>>(new Set());
  const [workspaceDeleteIntent, setWorkspaceDeleteIntent] = useState<WorkspaceDeleteIntent | null>(null);
  const [workspaceDeletePending, setWorkspaceDeletePending] = useState(false);
  const [workspaceDeleteError, setWorkspaceDeleteError] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState<'preset' | null>(null);
  const [quickApplyingPresetId, setQuickApplyingPresetId] = useState<string | null>(null);
  const [pendingPresetId, setPendingPresetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importTriggerRef = useRef<HTMLButtonElement>(null);
  const importDialogRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const workspaceManagerErrorOkRef = useRef<HTMLButtonElement>(null);
  const workspaceDeleteTriggerRef = useRef<HTMLElement | null>(null);
  const quickControlsRef = useRef<HTMLDivElement>(null);
  const presetQuickTriggerRef = useRef<HTMLButtonElement>(null);
  const importFeedbackRef = useRef(false);
  useDialogFocus(Boolean(importPreview), importDialogRef, importTriggerRef, '#workspace-import-name');
  const activePreset = presets.find((preset) => preset.id === activePresetId);
  const managerBusy = Boolean(fileOperation) || workspaceDeletePending;
  const quickBusy = managerBusy || podsLoading || Boolean(quickApplyingPresetId);
  const quickMenuBusy = quickBusy || Boolean(pendingPresetId);
  const canUpdateActivePreset = Boolean(activePreset && activePresetDirty && targets.length > 0);
  const visibleWorkspaces = useMemo(() => filterWorkspaces(workspaces, workspaceQuery), [workspaces, workspaceQuery]);
  const selectedVisibleWorkspaceIds = getSelectedVisibleWorkspaceIds(visibleWorkspaces, selectedWorkspaceIds);
  const allVisibleWorkspacesSelected = areAllVisibleWorkspacesSelected(visibleWorkspaces, selectedWorkspaceIds);
  const importNameError = importPreview && !importPreview.error
    ? validateWorkspaceName(importName, workspaces)
    : undefined;
  const visibleImportCandidates = importCandidates?.map((candidate, index) => ({ candidate, index })).filter(({ candidate }) => {
    const needle = importQuery.trim().toLowerCase();
    return !needle || [candidate.workspaceName ?? '', candidate.description ?? ''].join(' ').toLowerCase().includes(needle);
  }) ?? [];
  const selectedImportCandidates = (importCandidates ?? [])
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ index }) => selectedImportIndexes.includes(index));
  const importConflictFor = (candidate: WorkspaceImportResult) => {
    const name = candidate.workspaceName?.trim().toLocaleLowerCase();
    return name ? workspaces.find((workspace) => workspace.name.toLocaleLowerCase() === name) : undefined;
  };
  const selectedImportConflictIndexes = selectedImportCandidates
    .filter(({ candidate }) => Boolean(importConflictFor(candidate)))
    .map(({ index }) => index);
  const quickPresets = getQuickPresets(presets);
  const pendingPreset = pendingPresetId ? presets.find((preset) => preset.id === pendingPresetId) : undefined;
  const hasPendingTargetEdits = activePresetDirty || (activePresetId === null && targets.length > 0);

  const closeQuickMenu = (restoreFocus = true) => {
    setQuickOpen(null);
    if (!restoreFocus) return;
    window.setTimeout(() => {
      presetQuickTriggerRef.current?.focus();
    }, 0);
  };

  const togglePresetMenu = () => {
    if (quickMenuBusy) return;
    if (quickOpen === 'preset') {
      closeQuickMenu();
      return;
    }
    setQuickOpen('preset');
  };

  useEffect(() => {
    if (!quickOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!quickControlsRef.current?.contains(event.target as Node)) closeQuickMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeQuickMenu();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [quickOpen]);

  const openQuickPresetLibrary = () => {
    closeQuickMenu(false);
    onOpenPresetLibrary();
  };

  const selectQuickPreset = (id: string) => {
    if (quickMenuBusy) return;
    const preset = presets.find((item) => item.id === id);
    if (!preset) return;
    if (id === activePresetId && !hasPendingTargetEdits) {
      closeQuickMenu();
      return;
    }
    if (hasPendingTargetEdits) {
      setPendingPresetId(id);
      return;
    }
    closeQuickMenu(false);
    setQuickApplyingPresetId(id);
    void applyPresetAndLoad(id, useOpsFlowStore.getState, () => setQuickApplyingPresetId(null)).catch(() => undefined);
  };

  const confirmQuickPreset = () => {
    if (!pendingPreset || quickBusy) return;
    const id = pendingPreset.id;
    setPendingPresetId(null);
    closeQuickMenu(false);
    setQuickApplyingPresetId(id);
    void applyPresetAndLoad(id, useOpsFlowStore.getState, () => setQuickApplyingPresetId(null)).catch(() => undefined);
  };

  const updateActivePreset = () => {
    if (!activePreset || !canUpdateActivePreset) return;
    updatePreset(activePreset.id, activePreset.name, activePreset.description ?? '', targets);
  };

  const closeManager = () => {
    if (managerBusy) return;
    setOpen(false);
    if (importFeedbackRef.current) setStatus(null);
    importFeedbackRef.current = false;
    setWorkspaceManagerError(null);
    setWorkspaceEditor(null);
    setImportPreview(null);
    setImportCandidates(null);
    setSelectedImportIndexes([]);
    setImportQuery('');
    setActiveImportIndex(null);
    setImportConflictIndexes(null);
    setConflictResolutionPosition(null);
    setConflictResolutionNames({});
    setConflictResolutionSkipped(new Set());
    setWorkspaceQuery('');
    setSelectedWorkspaceIds([]);
    setImportName('');
    setActivateImport(false);
  };

  const clearWorkspaceSelection = () => {
    setSelectedWorkspaceIds([]);
  };

  const openManager = () => {
    setSelectedWorkspaceIds([]);
    setWorkspaceManagerError(null);
    setOpen(true);
  };

  const closeImportPreview = () => {
    setImportPreview(null);
    if (importFeedbackRef.current) setStatus(null);
    importFeedbackRef.current = false;
  };

  const closeImportBundle = () => {
    setImportCandidates(null);
    setSelectedImportIndexes([]);
    setImportQuery('');
    setActiveImportIndex(null);
    setImportConflictIndexes(null);
    setConflictResolutionPosition(null);
    setConflictResolutionNames({});
    setConflictResolutionSkipped(new Set());
    if (importFeedbackRef.current) setStatus(null);
    importFeedbackRef.current = false;
  };

  const toggleWorkspaceSelection = (id: string) => {
    setWorkspaceManagerError(null);
    setSelectedWorkspaceIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  };

  const toggleVisibleWorkspaceSelection = () => {
    setWorkspaceManagerError(null);
    setSelectedWorkspaceIds((current) => {
      if (allVisibleWorkspacesSelected) return current.filter((id) => !selectedVisibleWorkspaceIds.includes(id));
      return [...new Set([...current, ...visibleWorkspaces.map((workspace) => workspace.id)])];
    });
  };

  useEffect(() => {
    if (workspaceManagerError) {
      workspaceManagerErrorOkRef.current?.focus();
    }
  }, [workspaceManagerError]);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (managerBusy) return;
      if (workspaceDeleteIntent) return;
      if (workspaceManagerError) {
        setWorkspaceManagerError(null);
        return;
      }
      if (importPreview) {
        closeImportPreview();
        return;
      }
      if (conflictResolutionPosition !== null) {
        setConflictResolutionPosition(null);
        return;
      }
      if (importConflictIndexes) {
        setImportConflictIndexes(null);
        return;
      }
      if (importCandidates) {
        closeImportBundle();
        return;
      }
      if (workspaceEditor) return;
      closeManager();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeImportBundle, closeImportPreview, conflictResolutionPosition, importCandidates, importConflictIndexes, importPreview, managerBusy, open, workspaceDeleteIntent, workspaceEditor, workspaceManagerError]);

  const beginCreate = () => {
    clearWorkspaceSelection();
    setWorkspaceEditor({ mode: 'create' });
    setStatus(null);
  };

  const beginRename = (workspace = active) => {
    clearWorkspaceSelection();
    setWorkspaceEditor({ mode: 'rename', workspaceId: workspace.id });
    setStatus(null);
  };

  const saveWorkspace = (mode: 'create' | 'rename', workspaceId: string | undefined, name: string, description: string) => {
    const error = mode === 'create'
      ? createWorkspace(name, description)
      : workspaceId ? renameWorkspace(workspaceId, name, description) : 'Workspace not found.';
    if (!error) {
      clearWorkspaceSelection();
      setStatus(mode === 'create' ? 'Workspace created and selected.' : 'Workspace renamed.');
    }
    return error;
  };

  const exportWorkspace = () => {
    if (fileOperation || selectedWorkspaceIds.length === 0) return;
    setFileOperation('exporting');
    window.setTimeout(() => {
      try {
        const blob = new Blob([exportWorkspaces(selectedWorkspaceIds)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'ops-union-workspaces.json';
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
        setStatus(`${selectedWorkspaceIds.length} Workspace${selectedWorkspaceIds.length === 1 ? '' : 's'} export started.`);
      } catch {
        setStatus('The Workspace could not be exported.');
      } finally {
        clearWorkspaceSelection();
        window.setTimeout(() => setFileOperation(null), 350);
      }
    }, 0);
  };

  const readImport = (file: File) => {
    const startedAt = Date.now();
    clearWorkspaceSelection();
    setStatus(null);
    importFeedbackRef.current = false;
    setFileOperation('importing');
    if (file.size > MAX_WORKSPACE_IMPORT_BYTES) {
      setImportCandidates(null);
      setImportPreview({ accepted: [], invalid: [], error: 'The Workspace file is larger than the 2 MiB import limit.' });
      window.setTimeout(() => setFileOperation(null), 350);
      return;
    }
    void file.text().then((raw) => {
      const parsed = parseWorkspaceImportFile(raw);
      if (parsed.error) {
        setImportCandidates(null);
        setImportPreview({ accepted: [], invalid: [], error: parsed.error });
      } else if (parsed.workspaces.length === 1) {
        openImportPreview(parsed.workspaces[0]);
      } else {
        setImportPreview(null);
        setImportCandidates(parsed.workspaces);
        const validIndexes = parsed.workspaces
          .map((candidate, index) => candidate.error || candidate.accepted.length === 0 ? null : index)
          .filter((index): index is number => index !== null);
        setSelectedImportIndexes(validIndexes);
        setActiveImportIndex(validIndexes[0] ?? null);
        setImportQuery('');
      }
    }).catch(() => {
      importFeedbackRef.current = true;
      setStatus('The selected Workspace could not be read.');
    }).finally(() => {
      window.setTimeout(() => setFileOperation(null), Math.max(0, 350 - (Date.now() - startedAt)));
    });
  };

  const toggleImportSelection = (index: number) => {
    if (selectedImportIndexes.includes(index)) {
      if (activeImportIndex === index) setActiveImportIndex(null);
      setSelectedImportIndexes((current) => current.filter((item) => item !== index));
      return;
    }
    setSelectedImportIndexes((current) => [...current, index]);
  };

  const toggleImportActive = (index: number) => {
    setSelectedImportIndexes((current) => current.includes(index) ? current : [...current, index]);
    setActiveImportIndex((current) => current === index ? null : index);
  };

  const selectVisibleImports = () => {
    const visibleIndexes = visibleImportCandidates
      .filter(({ candidate }) => !candidate.error && candidate.accepted.length > 0)
      .map(({ index }) => index);
    setSelectedImportIndexes((current) => {
      const allSelected = visibleIndexes.every((index) => current.includes(index));
      return allSelected
        ? current.filter((index) => !visibleIndexes.includes(index))
        : [...new Set([...current, ...visibleIndexes])];
    });
  };

  const commitBundleImports = (strategy: BundleConflictStrategy, resolvedNames: Record<number, string | null> = {}) => {
    const candidates = importCandidates ?? [];
    const selected = candidates
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ index }) => selectedImportIndexes.includes(index));
    let importedCount = 0;
    for (const { candidate, index } of selected) {
      const conflict = selectedImportConflictIndexes.includes(index);
      if (strategy === 'skip' && conflict) continue;
      if (strategy === 'resolve' && Object.prototype.hasOwnProperty.call(resolvedNames, index) && resolvedNames[index] === null) continue;
      const name = Object.prototype.hasOwnProperty.call(resolvedNames, index)
        ? resolvedNames[index] ?? ''
        : candidate.suggestedName ?? candidate.workspaceName ?? '';
      if (!name) continue;
      const error = importWorkspace(candidate, name, activeImportIndex === index, { overwrite: strategy === 'overwrite' });
      if (!error) importedCount += 1;
    }
    setImportConflictIndexes(null);
    setConflictResolutionPosition(null);
    setConflictResolutionNames({});
    setConflictResolutionSkipped(new Set());
    setImportCandidates(null);
    setSelectedImportIndexes([]);
    setImportQuery('');
    setActiveImportIndex(null);
    importFeedbackRef.current = true;
    setStatus(`${importedCount} Workspace${importedCount === 1 ? '' : 's'} imported${strategy === 'skip' ? ', existing names skipped' : ''}.`);
    const activeWasImported = activeImportIndex !== null && selectedImportIndexes.includes(activeImportIndex) && !(
      strategy === 'skip' && selectedImportConflictIndexes.includes(activeImportIndex)
      || strategy === 'resolve' && Object.prototype.hasOwnProperty.call(resolvedNames, activeImportIndex) && resolvedNames[activeImportIndex] === null
    );
    if (activeWasImported) {
      closeManager();
    }
  };

  const beginBundleImport = () => {
    if (selectedImportIndexes.length === 0) return;
    if (selectedImportConflictIndexes.length > 0) {
      setImportConflictIndexes(selectedImportConflictIndexes);
      return;
    }
    commitBundleImports('resolve');
  };

  const currentConflictIndex = importConflictIndexes && conflictResolutionPosition !== null
    ? importConflictIndexes[conflictResolutionPosition]
    : null;
  const currentConflictCandidate = currentConflictIndex !== null ? importCandidates?.[currentConflictIndex] : undefined;
  const currentConflictName = currentConflictIndex !== null
    ? conflictResolutionNames[currentConflictIndex] ?? currentConflictCandidate?.workspaceName ?? ''
    : '';
  const currentConflictNameError = currentConflictIndex !== null && currentConflictName.trim()
    ? validateWorkspaceName(currentConflictName, workspaces)
    : 'Workspace name is required.';

  const resolveCurrentConflict = (skip: boolean) => {
    if (currentConflictIndex === null || !importConflictIndexes || conflictResolutionPosition === null) return;
    if (!skip && currentConflictNameError) return;
    const nextSkipped = new Set(conflictResolutionSkipped);
    if (skip) nextSkipped.add(currentConflictIndex);
    else nextSkipped.delete(currentConflictIndex);
    const nextNames = { ...conflictResolutionNames, [currentConflictIndex]: currentConflictName.trim() };
    const nextPosition = conflictResolutionPosition + 1;
    setConflictResolutionSkipped(nextSkipped);
    setConflictResolutionNames(nextNames);
    if (nextPosition < importConflictIndexes.length) {
      setConflictResolutionPosition(nextPosition);
      return;
    }
    const resolvedNames = Object.fromEntries(importConflictIndexes.map((index) => [index, nextSkipped.has(index) ? null : nextNames[index]]));
    commitBundleImports('resolve', resolvedNames);
  };

  const openImportPreview = (preview: WorkspaceImportResult) => {
    setStatus(null);
    importFeedbackRef.current = false;
    setImportPreview(preview);
    setImportName(preview.suggestedName ?? preview.workspaceName ?? '');
    setActivateImport(false);
  };

  const openWorkspaceDelete = (workspaceId: string, trigger: HTMLElement) => {
    if (managerBusy) return;
    const target = workspaces.find((workspace) => workspace.id === workspaceId);
    if (!target) return;
    if (workspaces.length <= 1) {
      setWorkspaceManagerError('At least one Workspace must remain.');
      return;
    }
    setWorkspaceManagerError(null);
    setWorkspaceDeleteError(null);
    workspaceDeleteTriggerRef.current = trigger;
    setWorkspaceDeleteIntent({ kind: 'workspace', id: workspaceId });
  };

  const openSelectedWorkspaceDelete = (trigger: HTMLElement) => {
    if (managerBusy) return;
    const ids = [...new Set(selectedWorkspaceIds)].filter((id) => workspaces.some((workspace) => workspace.id === id));
    if (ids.length === 0) return;
    if (ids.length >= workspaces.length) {
      setWorkspaceManagerError('At least one Workspace must remain. Use Keep active only to clear the other Workspaces.');
      return;
    }
    setWorkspaceManagerError(null);
    setWorkspaceDeleteError(null);
    workspaceDeleteTriggerRef.current = trigger;
    setWorkspaceDeleteIntent({ kind: 'selected', ids });
  };

  const openKeepActiveOnlyDelete = (trigger: HTMLElement) => {
    if (managerBusy) return;
    const ids = workspaces.filter((workspace) => workspace.id !== activeWorkspaceId).map((workspace) => workspace.id);
    if (ids.length === 0) return;
    setWorkspaceManagerError(null);
    setWorkspaceDeleteError(null);
    workspaceDeleteTriggerRef.current = trigger;
    setWorkspaceDeleteIntent({ kind: 'keep-active-only', ids, activeId: activeWorkspaceId });
  };

  const confirmWorkspaceDeletion = async () => {
    if (!workspaceDeleteIntent || workspaceDeletePending) return;
    const intent = workspaceDeleteIntent;
    setWorkspaceDeletePending(true);
    setWorkspaceDeleteError(null);
    await Promise.resolve();
    try {
      if (intent.kind === 'workspace') {
        const target = useOpsFlowStore.getState().workspaces.find((workspace) => workspace.id === intent.id);
        if (!target) {
          setWorkspaceDeleteIntent(null);
          setStatus('Workspace no longer exists.');
          return;
        }
        const error = deleteWorkspace(intent.id);
        if (error) {
          setWorkspaceDeleteError(error);
          return;
        }
        clearWorkspaceSelection();
        setWorkspaceDeleteIntent(null);
        setStatus(null);
        return;
      }

      const currentWorkspaceIds = useOpsFlowStore.getState().workspaces.map((workspace) => workspace.id);
      const currentIds = intent.ids.filter((id) => currentWorkspaceIds.includes(id));
      if (currentIds.length !== intent.ids.length) {
        setWorkspaceDeleteIntent(null);
        setStatus('The Workspace selection changed. Review the manager and try again.');
        return;
      }
      if (currentIds.length === 0 || currentIds.length >= currentWorkspaceIds.length) {
        setWorkspaceDeleteIntent(null);
        setStatus('At least one Workspace must remain.');
        return;
      }
      const error = deleteWorkspaces(currentIds);
      if (error) {
        setWorkspaceDeleteError(error);
        return;
      }
      clearWorkspaceSelection();
      setWorkspaceDeleteIntent(null);
      setStatus(null);
    } catch {
      setWorkspaceDeleteError('The Workspace could not be deleted.');
    } finally {
      setWorkspaceDeletePending(false);
    }
  };

  const submitImport = () => {
    if (!importPreview) return;
    if (importNameError) return;
    const shouldActivate = activateImport;
    const error = importWorkspace(importPreview, importName, shouldActivate);
    if (error) {
      importFeedbackRef.current = true;
      setStatus(error);
      return;
    }
    setSelectedWorkspaceIds([]);
    setImportPreview(null);
    setImportCandidates((current) => {
      if (!current) return null;
      const remaining = current.filter((candidate) => candidate !== importPreview);
      return remaining.length > 0 ? remaining : null;
    });
    importFeedbackRef.current = true;
    setStatus(shouldActivate ? 'Workspace imported and selected.' : 'Workspace imported.');
    if (shouldActivate) {
      closeManager();
    }
  };

  if (!active) return null;
  const editorWorkspace = workspaceEditor?.mode === 'rename'
    ? workspaces.find((workspace) => workspace.id === workspaceEditor.workspaceId) ?? null
    : null;
  const deletingWorkspace = workspaceDeleteIntent?.kind === 'workspace'
    ? workspaces.find((workspace) => workspace.id === workspaceDeleteIntent.id)
    : undefined;
  const deletingWorkspaces = workspaceDeleteIntent && workspaceDeleteIntent.kind !== 'workspace'
    ? workspaces.filter((workspace) => workspaceDeleteIntent.ids.includes(workspace.id))
    : [];
  const retainedWorkspace = workspaceDeleteIntent?.kind === 'keep-active-only'
    ? workspaces.find((workspace) => workspace.id === workspaceDeleteIntent.activeId)
    : undefined;
  const selectedPresetCount = deletingWorkspace
    ? deletingWorkspace.presets.length
    : deletingWorkspaces.reduce((count, workspace) => count + workspace.presets.length, 0);
  const activeDeletion = deletingWorkspace?.id === activeWorkspaceId
    || deletingWorkspaces.some((workspace) => workspace.id === activeWorkspaceId);
  const fallbackWorkspace = deletingWorkspace && activeDeletion
    ? workspaces.filter((workspace) => workspace.id !== deletingWorkspace.id)[Math.min(
      workspaces.findIndex((workspace) => workspace.id === deletingWorkspace.id),
      workspaces.length - 2,
    )]
    : undefined;
  const workspaceDeleteTitle = deletingWorkspace
    ? `Delete Workspace "${deletingWorkspace.name}"?`
    : workspaceDeleteIntent?.kind === 'keep-active-only'
      ? 'Keep the active Workspace only?'
      : `Delete ${deletingWorkspaces.length} selected Workspace${deletingWorkspaces.length === 1 ? '' : 's'}?`;
  const workspaceDeleteDescription = deletingWorkspace
    ? `This will remove ${deletingWorkspace.name} and its ${selectedPresetCount} saved preset${selectedPresetCount === 1 ? '' : 's'}. ${activeDeletion ? `"${fallbackWorkspace?.name ?? 'the surviving Workspace'}" will become active without applying a fallback preset. ` : ''}Current targets, pod results, filters, logs, theme, and query state will remain unchanged.`
    : workspaceDeleteIntent?.kind === 'keep-active-only'
      ? `This will remove ${deletingWorkspaces.length} Workspace${deletingWorkspaces.length === 1 ? '' : 's'} and keep "${retainedWorkspace?.name ?? 'the active Workspace'}" active. ${selectedPresetCount} saved preset${selectedPresetCount === 1 ? '' : 's'} will be removed; no fallback preset or operational reset will be applied.`
      : `This will remove ${deletingWorkspaces.length} selected Workspace${deletingWorkspaces.length === 1 ? '' : 's'} and ${selectedPresetCount} saved preset${selectedPresetCount === 1 ? '' : 's'}. ${activeDeletion ? 'The existing deterministic surviving Workspace will become active without applying a fallback preset. ' : ''}Current targets, pod results, filters, logs, theme, and query state will remain unchanged.`;
  const workspaceDeleteContext = deletingWorkspace ? (
    <p><strong>{deletingWorkspace.name}</strong> · {selectedPresetCount} saved preset{selectedPresetCount === 1 ? '' : 's'} · {activeDeletion ? 'Active Workspace' : 'Inactive Workspace'}</p>
  ) : (
    <div>
      <p><strong>{deletingWorkspaces.length} Workspace{deletingWorkspaces.length === 1 ? '' : 's'}</strong> · {selectedPresetCount} saved preset{selectedPresetCount === 1 ? '' : 's'} total</p>
      <ul aria-label="Workspaces to delete">
        {deletingWorkspaces.map((workspace) => <li key={workspace.id}>{workspace.name}{workspace.id === activeWorkspaceId ? ' (active)' : ''}</li>)}
      </ul>
    </div>
  );

  return (
    <section className="workspace-section" aria-label="Active workspace and preset">
      <WorkspaceQuickControls
        active={active}
        activePreset={activePreset}
        activePresetId={activePresetId}
        activePresetDirty={activePresetDirty}
        quickPresets={quickPresets}
        quickOpen={quickOpen}
        quickApplyingPresetId={quickApplyingPresetId}
        managerBusy={managerBusy}
        quickBusy={quickBusy}
        quickMenuBusy={quickMenuBusy}
        open={open}
        canUpdateActivePreset={canUpdateActivePreset}
        quickControlsRef={quickControlsRef}
        presetQuickTriggerRef={presetQuickTriggerRef}
        onOpenManager={() => { closeQuickMenu(false); openManager(); }}
        onTogglePresetMenu={togglePresetMenu}
        onSelectPreset={selectQuickPreset}
        onOpenPresetLibrary={openQuickPresetLibrary}
        onUpdateActivePreset={updateActivePreset}
      />
      {quickApplyingPresetId && (
        <p className="workspace-status" role="status" aria-live="polite">
          <Loader size={13} className="spinning" /> Loading pods for {presets.find((preset) => preset.id === quickApplyingPresetId)?.name ?? 'selected preset'}...
        </p>
      )}
      {pendingPreset && (
        <PresetReplacementConfirmation
          preset={pendingPreset}
          pending={Boolean(quickApplyingPresetId)}
          onCancel={() => setPendingPresetId(null)}
          onConfirm={confirmQuickPreset}
          restoreFocusRef={presetQuickTriggerRef}
        />
      )}
      {open && (
        <div className="workspace-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeManager()}>
          <section className="workspace-modal" ref={dialogRef} id="workspace-manager" role="dialog" aria-modal="true" aria-labelledby="workspace-manager-title" aria-busy={managerBusy} tabIndex={-1}>
          <div className="workspace-manager-header">
            <div>
              <span className="eyebrow">Workspace library</span>
              <h2 id="workspace-manager-title">Workspaces</h2>
            </div>
            <button type="button" className="icon-button subtle" onClick={closeManager} aria-label="Close Workspace manager" disabled={managerBusy}>
              <X size={15} />
            </button>
          </div>
          <div className="workspace-manager-toolbar">
            {workspaces.length > 0 ? (
              <label className="preset-search workspace-search">
                <Search size={13} />
                <span className="visually-hidden">Search Workspaces</span>
                <input
                  autoFocus
                  value={workspaceQuery}
                  onChange={(event) => setWorkspaceQuery(event.target.value)}
                  disabled={managerBusy}
                  placeholder="Search Workspaces..."
                />
                {workspaceQuery && (
                  <button type="button" className="preset-search-clear" onClick={() => setWorkspaceQuery('')} aria-label="Clear Workspace search">
                    <X size={12} />
                  </button>
                )}
              </label>
            ) : <span />}
            <button type="button" className="text-button" onClick={toggleVisibleWorkspaceSelection} disabled={visibleWorkspaces.length === 0 || managerBusy}>
              {allVisibleWorkspacesSelected ? (workspaceQuery.trim() ? 'Clear visible' : 'Clear all') : (workspaceQuery.trim() ? 'Select visible' : 'Select all')}
            </button>
          </div>
          <div className="workspace-list">
            {visibleWorkspaces.map((workspace) => (
              <div className={`workspace-list-item ${workspace.id === activeWorkspaceId ? 'is-active' : ''}`} key={workspace.id}>
                <input
                  className="workspace-select-checkbox"
                  type="checkbox"
                  checked={selectedWorkspaceIds.includes(workspace.id)}
                  onChange={() => toggleWorkspaceSelection(workspace.id)}
                  disabled={managerBusy}
                  aria-label={`Select Workspace ${workspace.name} for export`}
                />
                <button
                  type="button"
                  className="workspace-list-select"
                  disabled={managerBusy}
                  onClick={() => {
                    const error = switchWorkspace(workspace.id);
                    if (error) {
                      setStatus(error);
                      return;
                    }
                    setStatus(null);
                    closeManager();
                  }}
                  aria-pressed={workspace.id === activeWorkspaceId}
                >
                  <strong title={workspace.name}>{workspace.name}</strong>
                  <small>{workspace.presets.length} preset{workspace.presets.length === 1 ? '' : 's'}{workspace.description ? ` · ${workspace.description}` : ''}</small>
                </button>
                {workspace.id === activeWorkspaceId && <span className="workspace-active-label">Active</span>}
                <button type="button" className="icon-button subtle" onClick={() => beginRename(workspace)} aria-label={`Rename Workspace ${workspace.name}`} title="Rename Workspace" disabled={managerBusy}>
                  <Pencil size={13} />
                </button>
                  <button type="button" className="icon-button subtle danger" onClick={(event) => openWorkspaceDelete(workspace.id, event.currentTarget)} aria-label={`Delete Workspace ${workspace.name}`} title="Delete Workspace" disabled={workspaces.length <= 1 || managerBusy}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {workspaces.length > 0 && visibleWorkspaces.length === 0 && <p className="sidebar-hint">No Workspace matches the search.</p>}
          </div>
          <div className="workspace-manager-actions">
            <button type="button" className="secondary-button" onClick={beginCreate} disabled={managerBusy}><Plus size={13} /> Create</button>
            <button type="button" className="secondary-button" onClick={exportWorkspace} disabled={managerBusy || selectedWorkspaceIds.length === 0} aria-busy={fileOperation === 'exporting'}>{fileOperation === 'exporting' ? <Loader size={13} className="spinning" /> : <Download size={13} />} {fileOperation === 'exporting' ? 'Exporting...' : 'Export selected'}{fileOperation !== 'exporting' && selectedWorkspaceIds.length > 0 ? ` (${selectedWorkspaceIds.length})` : ''}</button>
            <button
              ref={importTriggerRef}
              type="button"
              className="secondary-button"
              onClick={() => {
                if (fileOperation) return;
                fileInputRef.current?.click();
              }}
              disabled={managerBusy}
              aria-busy={fileOperation === 'importing'}
            >{fileOperation === 'importing' ? <Loader size={13} className="spinning" /> : <FileUp size={13} />} {fileOperation === 'importing' ? 'Importing...' : 'Import'}</button>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) readImport(file);
                else setFileOperation(null);
              }}
              aria-label="Choose Workspace JSON file"
            />
          </div>
          <div className="workspace-manager-danger-actions" aria-label="Workspace deletion actions">
            {selectedWorkspaceIds.length > 0 && <button type="button" className="workspace-danger-action" onClick={(event) => openSelectedWorkspaceDelete(event.currentTarget)} disabled={managerBusy} title="Delete selected Workspaces" aria-label="Delete selected Workspaces"><Trash2 size={12} /> <span>Remove selected</span></button>}
            {workspaces.length > 1 && <button type="button" className="workspace-danger-action" onClick={(event) => openKeepActiveOnlyDelete(event.currentTarget)} disabled={managerBusy} title="Delete all Workspaces except the active Workspace" aria-label="Delete all Workspaces except the active Workspace"><Trash2 size={12} /> <span>Keep active only</span></button>}
          </div>
          {selectedWorkspaceIds.length > 0 && <p className="workspace-selection-status" role="status">{selectedWorkspaceIds.length} Workspace{selectedWorkspaceIds.length === 1 ? '' : 's'} selected for export.</p>}
          {fileOperation && <p className="workspace-status" role="status" aria-live="polite"><Loader size={13} className="spinning" /> {fileOperation === 'importing' ? 'Reading Workspace...' : 'Preparing Workspace download...'}</p>}
          {workspaceDeleteIntent && (
            <DestructiveConfirmation
              title={workspaceDeleteTitle}
              description={workspaceDeleteDescription}
              context={workspaceDeleteContext}
              confirmLabel={workspaceDeleteIntent.kind === 'workspace' ? 'Delete Workspace' : 'Delete Workspaces'}
              pending={workspaceDeletePending}
              error={workspaceDeleteError}
              onCancel={() => {
                if (!workspaceDeletePending) setWorkspaceDeleteIntent(null);
              }}
              onConfirm={confirmWorkspaceDeletion}
              restoreFocusRef={workspaceDeleteTriggerRef}
              fallbackFocusRef={dialogRef}
            />
          )}
          {workspaceManagerError && (
            <div className="workspace-manager-alert-layer">
              <section className="workspace-manager-alert" role="alertdialog" aria-modal="true" aria-labelledby="workspace-manager-alert-title" aria-describedby="workspace-manager-alert-message">
                <span className="eyebrow">Workspace action blocked</span>
                <h3 id="workspace-manager-alert-title">Cannot remove Workspaces</h3>
                <p id="workspace-manager-alert-message">{workspaceManagerError}</p>
                <button ref={workspaceManagerErrorOkRef} type="button" className="primary-button" onClick={() => setWorkspaceManagerError(null)}>OK</button>
              </section>
            </div>
          )}
          </section>
        </div>
      )}
      {importCandidates && !importPreview && (
        <div className="preset-dialog-layer" onMouseDown={(event) => !managerBusy && event.target === event.currentTarget && closeImportBundle()}>
          <section className="preset-library workspace-import-candidates" role="dialog" aria-modal="true" aria-labelledby="workspace-import-candidates-title" aria-busy={managerBusy}>
            <div className="preset-library-header">
              <div>
                <span className="eyebrow">Workspace bundle</span>
                <h2 id="workspace-import-candidates-title">Choose Workspaces</h2>
              </div>
              <button type="button" className="icon-button subtle" onClick={closeImportBundle} aria-label="Close Workspace bundle" disabled={managerBusy}><X size={15} /></button>
            </div>
            <p className="preset-dialog-summary">Select the Workspaces to import. You can mark at most one as active after import.</p>
            <div className="workspace-bundle-toolbar">
              <label className="preset-search workspace-search">
                <Search size={13} />
                <span className="visually-hidden">Search bundle Workspaces</span>
                <input value={importQuery} onChange={(event) => setImportQuery(event.target.value)} placeholder="Search by Workspace name..." autoFocus disabled={managerBusy} />
                {importQuery && <button type="button" className="preset-search-clear" onClick={() => setImportQuery('')} aria-label="Clear bundle search" disabled={managerBusy}><X size={12} /></button>}
              </label>
              <button type="button" className="text-button" onClick={selectVisibleImports} disabled={visibleImportCandidates.length === 0 || managerBusy}>
                {visibleImportCandidates.every(({ index }) => selectedImportIndexes.includes(index)) ? (importQuery.trim() ? 'Clear visible' : 'Clear all') : (importQuery.trim() ? 'Select visible' : 'Select all')}
              </button>
            </div>
            <div className="preset-library-list" role="group" aria-label="Workspaces available to import">
              {visibleImportCandidates.map(({ candidate, index }) => {
                const conflict = importConflictFor(candidate);
                const selectable = !candidate.error && candidate.accepted.length > 0;
                return (
                <div className={`preset-library-item workspace-bundle-item ${conflict ? 'has-conflict' : ''}`} key={`${candidate.workspaceName ?? 'workspace'}-${index}`}>
                  <input
                    className="workspace-bundle-checkbox"
                    type="checkbox"
                    checked={selectedImportIndexes.includes(index)}
                    onChange={() => toggleImportSelection(index)}
                    disabled={!selectable || managerBusy}
                    aria-label={`Select Workspace ${candidate.workspaceName ?? 'unnamed'}`}
                  />
                  <div className="workspace-bundle-copy">
                    <Layers size={14} />
                    <span className="preset-text">
                      <strong>{candidate.workspaceName ?? 'Unnamed Workspace'}</strong>
                      <small>{candidate.accepted.length} preset(s) ready{candidate.invalid.length > 0 ? ` · ${candidate.invalid.length} invalid` : ''}</small>
                      {conflict && <em className="workspace-bundle-conflict">Name already exists</em>}
                      {candidate.error && <em>{candidate.error}</em>}
                    </span>
                  </div>
                  <label className="workspace-bundle-active" title="Make this Workspace active after import">
                    <input type="checkbox" checked={activeImportIndex === index} onChange={() => toggleImportActive(index)} disabled={!selectable || managerBusy} />
                    <span>Active</span>
                  </label>
                </div>
                );
              })}
              {visibleImportCandidates.length === 0 && <p className="sidebar-hint">No Workspace matches the search.</p>}
            </div>
            <div className="preset-editor-actions">
              <button type="button" className="secondary-button" onClick={closeImportBundle} disabled={managerBusy}>Cancel</button>
              <button type="button" className="primary-button" onClick={beginBundleImport} disabled={managerBusy || selectedImportIndexes.length === 0}><Layers size={13} /> Import selected ({selectedImportIndexes.length})</button>
            </div>
          </section>
        </div>
      )}
      {importConflictIndexes && conflictResolutionPosition === null && (
        <div className="preset-dialog-layer" role="presentation">
          <section className="preset-secondary-dialog workspace-conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-conflict-title">
            <div className="preset-secondary-dialog-header">
              <div>
                <span className="eyebrow">Import conflicts</span>
                <h3 id="workspace-conflict-title">Some names already exist</h3>
              </div>
              <button type="button" className="icon-button subtle" onClick={() => setImportConflictIndexes(null)} aria-label="Close import conflict options"><X size={15} /></button>
            </div>
            <p className="preset-dialog-summary">{importConflictIndexes.length} selected Workspace{importConflictIndexes.length === 1 ? '' : 's'} have the same name as an existing Workspace. Choose how to continue.</p>
            <div className="workspace-conflict-actions">
              <button type="button" className="primary-button" onClick={() => commitBundleImports('overwrite')}><Check size={13} /> Overwrite existing</button>
              <button type="button" className="secondary-button" onClick={() => commitBundleImports('skip')}><X size={13} /> Skip existing</button>
              <button type="button" className="secondary-button" onClick={() => { setConflictResolutionNames({}); setConflictResolutionSkipped(new Set()); setConflictResolutionPosition(0); }}><Pencil size={13} /> Resolve one by one</button>
            </div>
          </section>
        </div>
      )}
      {importConflictIndexes && conflictResolutionPosition !== null && currentConflictCandidate && (
        <div className="preset-dialog-layer" role="presentation">
          <section className="preset-editor workspace-conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-resolve-conflict-title">
            <div className="preset-editor-header">
              <div><span className="eyebrow">Resolve conflict {conflictResolutionPosition + 1} of {importConflictIndexes.length}</span><h2 id="workspace-resolve-conflict-title">Choose a new name</h2></div>
              <button type="button" className="icon-button subtle" onClick={() => setConflictResolutionPosition(null)} aria-label="Close conflict resolver"><X size={15} /></button>
            </div>
            <p className="preset-dialog-summary">“{currentConflictCandidate.workspaceName}” already exists. Enter a different name for this imported Workspace, or skip it.</p>
            <div className="preset-editor-fields">
              <label><span>Resulting workspace name</span><input value={currentConflictName} onChange={(event) => setConflictResolutionNames((current) => ({ ...current, [currentConflictIndex ?? -1]: event.target.value }))} autoFocus aria-invalid={Boolean(currentConflictNameError)} /></label>
            </div>
            {currentConflictNameError && <p className="workspace-import-error" role="alert">{currentConflictNameError}</p>}
            <div className="preset-editor-actions">
              <button type="button" className="secondary-button" onClick={() => resolveCurrentConflict(true)}>Skip this</button>
              <button type="button" className="primary-button" onClick={() => resolveCurrentConflict(false)} disabled={Boolean(currentConflictNameError)}><Check size={13} /> Continue</button>
            </div>
          </section>
        </div>
      )}
      {workspaceEditor && (
        <WorkspaceEditor
          mode={workspaceEditor.mode}
          workspace={editorWorkspace}
          onClose={() => setWorkspaceEditor(null)}
          onSave={(name, description) => {
            const error = saveWorkspace(workspaceEditor.mode, workspaceEditor.mode === 'rename' ? workspaceEditor.workspaceId : undefined, name, description);
            if (!error) setWorkspaceEditor(null);
            return error;
          }}
        />
      )}
      {importPreview && (
        <div className="preset-editor-backdrop" onMouseDown={(event) => !managerBusy && event.target === event.currentTarget && closeImportPreview()}>
          <section ref={importDialogRef} className="preset-editor workspace-import-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-import-title" aria-busy={managerBusy} tabIndex={-1}>
            <div className="preset-editor-header">
              <div><span className="eyebrow">Review file</span><h2 id="workspace-import-title">Import workspace</h2></div>
              <button type="button" className="icon-button subtle" onClick={closeImportPreview} aria-label="Close Workspace import preview" disabled={managerBusy}><X size={15} /></button>
            </div>
            {importPreview.error ? <div className="preset-library-feedback is-error" role="alert">{importPreview.error}</div> : (
              <>
                <p className="preset-dialog-summary">{importPreview.accepted.length} preset(s) ready, {importPreview.invalid.length} invalid. A new Workspace will be created.</p>
                <div className="preset-editor-fields">
                  <label htmlFor="workspace-import-name"><span>Resulting workspace name</span><input id="workspace-import-name" name="workspace-name" autoComplete="off" value={importName} onChange={(event) => setImportName(event.target.value)} autoFocus disabled={managerBusy} aria-invalid={Boolean(importNameError)} aria-describedby={importNameError ? 'workspace-import-name-error' : undefined} /></label>
                </div>
                {importNameError && <p className="workspace-import-error" id="workspace-import-name-error" role="alert">{importNameError}</p>}
                <label className="workspace-import-activate"><input type="checkbox" checked={activateImport} onChange={(event) => setActivateImport(event.target.checked)} disabled={managerBusy} /> Select imported Workspace after confirmation</label>
                {importPreview.invalid.map((entry) => <p className="workspace-import-error" key={entry.index}>Entry {entry.index + 1}: {entry.reason}</p>)}
              </>
            )}
            <div className="preset-editor-actions">
              <button type="button" className="secondary-button" onClick={closeImportPreview} disabled={managerBusy}>Cancel</button>
              <button type="button" className="primary-button" onClick={submitImport} disabled={managerBusy || Boolean(importPreview.error) || Boolean(importNameError) || importPreview.accepted.length === 0 || !importName.trim()}><Save size={13} /> Import workspace</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function PresetReplacementConfirmation({
  preset,
  pending,
  onCancel,
  onConfirm,
  restoreFocusRef,
}: {
  preset: Preset;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  restoreFocusRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    return () => {
      const trigger = restoreFocusRef.current;
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, [restoreFocusRef]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!pending) onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="preset-dialog-layer"
      onMouseDown={(event) => {
        if (!pending && event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        className="preset-secondary-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={pending}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="preset-secondary-dialog-header">
          <div>
            <span className="eyebrow">Unsaved target changes</span>
            <h3 id={titleId}>Replace current targets?</h3>
          </div>
          <button type="button" className="icon-button subtle" onClick={onCancel} aria-label="Cancel preset application" disabled={pending}>
            <X size={15} />
          </button>
        </div>
        <p className="preset-dialog-summary" id={descriptionId}>
          Applying <strong>{preset.name}</strong> will replace the current unsaved target changes and fetch pods for its saved targets.
        </p>
        <div className="destructive-confirmation-context">
          <p><strong>{preset.targets.length} target{preset.targets.length === 1 ? '' : 's'}</strong>: {describePreset(preset)}</p>
        </div>
        <div className="preset-secondary-dialog-actions">
          <button ref={cancelRef} type="button" className="secondary-button" onClick={onCancel} disabled={pending}>Keep current targets</button>
          <button type="button" className="primary-button" onClick={onConfirm} disabled={pending}>
            {pending ? <Loader size={13} className="spinning" /> : <Check size={13} />}
            {pending ? 'Applying...' : 'Apply preset'}
          </button>
        </div>
      </section>
    </div>
  );
}

interface WorkspaceEditorProps {
  mode: 'create' | 'rename';
  workspace: Workspace | null;
  onClose: () => void;
  onSave: (name: string, description: string) => string | undefined;
}

function WorkspaceEditor({ mode, workspace, onClose, onSave }: WorkspaceEditorProps) {
  const [name, setName] = useState(workspace?.name ?? '');
  const [description, setDescription] = useState(workspace?.description ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (mode === 'rename' && !workspace) return null;

  const submit = () => {
    const saveError = onSave(name, description);
    if (saveError) setError(saveError);
  };

  return (
    <div className="preset-editor-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="preset-editor" role="dialog" aria-modal="true" aria-labelledby="workspace-editor-title">
        <div className="preset-editor-header">
          <div>
            <span className="eyebrow">Workspace details</span>
            <h2 id="workspace-editor-title">{mode === 'create' ? 'Create workspace' : 'Edit workspace'}</h2>
          </div>
          <button type="button" className="icon-button subtle" onClick={onClose} aria-label="Close workspace editor">
            <X size={15} />
          </button>
        </div>

        {error && <div className="preset-library-feedback is-error" role="alert">{error}</div>}

        <div className="preset-editor-fields">
          <label>
            <span>Name</span>
            <input value={name} maxLength={MAX_WORKSPACE_NAME_LENGTH} onChange={(event) => { setName(event.target.value); setError(null); }} autoFocus onKeyDown={(event) => event.key === 'Enter' && submit()} />
          </label>
          <label>
            <span>Description <em>optional</em></span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is this workspace used for?" rows={2} />
          </label>
        </div>

        <div className="preset-editor-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary-button" onClick={submit} disabled={!name.trim()}>
            <Save size={13} /> {mode === 'create' ? 'Create workspace' : 'Save changes'}
          </button>
        </div>
      </section>
    </div>
  );
}

interface PresetLibraryProps {
  presets: Preset[];
  activeWorkspaceId: string;
  activePresetId: string | null;
  activePresetDirty: boolean;
  applyingPresetId: string | null;
  workspaceName: string;
  onClose: () => void;
  onApply: (id: string) => void;
  onEdit: (id: string) => void;
}

type PresetDeleteIntent =
  { kind: 'selected'; ids: string[]; presets: Preset[]; trigger: HTMLElement };

function PresetLibrary({
  presets,
  activeWorkspaceId,
  activePresetId,
  activePresetDirty,
  applyingPresetId,
  workspaceName,
  onClose,
  onApply,
  onEdit,
}: PresetLibraryProps) {
  const deletePresets = useOpsFlowStore((s) => s.deletePresets);
  const workspaces = useOpsFlowStore((s) => s.workspaces);
  const transferPresets = useOpsFlowStore((s) => s.transferPresets);
  const copyPresetsFromWorkspace = useOpsFlowStore((s) => s.copyPresetsFromWorkspace);
  const [query, setQuery] = useState('');
  const [deleteIntent, setDeleteIntent] = useState<PresetDeleteIntent | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedPresetIds, setSelectedPresetIds] = useState<Set<string>>(new Set());
  const [transferMode, setTransferMode] = useState<TransferMode | null>(null);
  const [destinationWorkspaceIds, setDestinationWorkspaceIds] = useState<Set<string>>(new Set());
  const [transferStrategy, setTransferStrategy] = useState<TransferConflictStrategy>('reject');
  const [transferConflictDecisionOpen, setTransferConflictDecisionOpen] = useState(false);
  const [transferConfirmationOpen, setTransferConfirmationOpen] = useState(false);
  const [transferPending, setTransferPending] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [copySourceWorkspaceId, setCopySourceWorkspaceId] = useState<string | null>(null);
  const [copyChooserOpen, setCopyChooserOpen] = useState(false);
  const [copySelectedPresetIds, setCopySelectedPresetIds] = useState<Set<string>>(new Set());
  const [copyStrategy, setCopyStrategy] = useState<CopyConflictStrategy>('reject');
  const [copyConflictDecisionOpen, setCopyConflictDecisionOpen] = useState(false);
  const [copyConfirmationOpen, setCopyConfirmationOpen] = useState(false);
  const [copyPending, setCopyPending] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const transferTriggerRef = useRef<HTMLElement | null>(null);
  const copyTriggerRef = useRef<HTMLElement | null>(null);
  const libraryBusy = Boolean(applyingPresetId) || deletePending || transferPending || copyPending;
  const libraryRef = useRef<HTMLElement>(null);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);
  const visiblePresets = useMemo(() => filterPresets(presets, query), [presets, query]);
  const visiblePresetIds = useMemo(() => getPresetIds(visiblePresets), [visiblePresets]);
  const selectionState = getPresetSelectionState(selectedPresetIds, visiblePresetIds);
  const transferPlan = useMemo<TransferPlan | null>(() => {
    if (!transferMode) return null;
    return buildTransferPlan(
      catalogForTransfer(workspaces, activeWorkspaceId, presets),
      {
        mode: transferMode,
        sourceWorkspaceId: activeWorkspaceId,
        presetIds: [...selectedPresetIds],
        destinationWorkspaceIds: [...destinationWorkspaceIds],
      },
    );
  }, [activeWorkspaceId, destinationWorkspaceIds, presets, selectedPresetIds, transferMode, workspaces]);
  const sourceWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const selectedPresets = presets.filter((preset) => selectedPresetIds.has(preset.id));
  const destinationWorkspaces = workspaces.filter((workspace) => workspace.id !== activeWorkspaceId);
  const copySourceWorkspace = workspaces.find((workspace) => workspace.id === copySourceWorkspaceId);
  const copySelectedPresets = copySourceWorkspace?.presets.filter((preset) => copySelectedPresetIds.has(preset.id)) ?? [];
  const copyPlan = useMemo<CopyPlan | null>(() => {
    if (!copySourceWorkspaceId || copySelectedPresetIds.size === 0) return null;
    return buildCopyPlan(
      catalogForTransfer(workspaces, activeWorkspaceId, presets),
      {
        sourceWorkspaceId: copySourceWorkspaceId,
        sourcePresetIds: [...copySelectedPresetIds],
        destinationWorkspaceId: activeWorkspaceId,
      },
    );
  }, [activeWorkspaceId, copySelectedPresetIds, copySourceWorkspaceId, presets, workspaces]);

  useEffect(() => {
    setSelectedPresetIds((current) => {
      const reconciled = reconcilePresetSelection(current, presets.map((preset) => preset.id));
      if (reconciled.size === current.size && [...reconciled].every((id) => current.has(id))) return current;
      return reconciled;
    });
  }, [presets]);

  useEffect(() => {
    setSelectedPresetIds(new Set());
    setTransferMode(null);
    setDestinationWorkspaceIds(new Set());
    setTransferStrategy('reject');
    setTransferConflictDecisionOpen(false);
    setTransferConfirmationOpen(false);
    setTransferError(null);
    setCopySourceWorkspaceId(null);
    setCopyChooserOpen(false);
    setCopySelectedPresetIds(new Set());
    setCopyStrategy('reject');
    setCopyConflictDecisionOpen(false);
    setCopyConfirmationOpen(false);
    setCopyError(null);
  }, [activeWorkspaceId]);

  useEffect(() => {
    setDestinationWorkspaceIds((current) => {
      const validIds = new Set(destinationWorkspaces.map((workspace) => workspace.id));
      const reconciled = new Set([...current].filter((id) => validIds.has(id)));
      if (reconciled.size === current.size && [...reconciled].every((id) => current.has(id))) return current;
      setTransferConflictDecisionOpen(false);
      setTransferConfirmationOpen(false);
      return reconciled;
    });
  }, [destinationWorkspaces]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (libraryBusy) return;
      if (deleteIntent) return;
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteIntent, libraryBusy, onClose]);

  const closeLibrary = () => {
    if (libraryBusy) return;
    onClose();
  };

  const beginTransfer = (mode: TransferMode, trigger: HTMLElement) => {
    if (libraryBusy || selectedPresetIds.size === 0) return;
    transferTriggerRef.current = trigger;
    setTransferMode(mode);
    setDestinationWorkspaceIds(new Set());
    setTransferStrategy('reject');
    setTransferConflictDecisionOpen(false);
    setTransferConfirmationOpen(false);
    setTransferError(null);
  };

  const beginCopy = (trigger: HTMLElement) => {
    if (libraryBusy || workspaces.length < 2) return;
    copyTriggerRef.current = trigger;
    setCopyChooserOpen(true);
    setCopySourceWorkspaceId(null);
    setCopySelectedPresetIds(new Set());
    setCopyStrategy('reject');
    setCopyConflictDecisionOpen(false);
    setCopyConfirmationOpen(false);
    setCopyError(null);
    setCopyMessage(null);
  };

  const reviewCopy = () => {
    if (!copyPlan || copyPlan.entries.length === 0) return;
    setCopyError(null);
    if (copyPlan.conflicts.length > 0) {
      setCopyConflictDecisionOpen(true);
      return;
    }
    setCopyStrategy('reject');
    setCopyConfirmationOpen(true);
  };

  const confirmCopy = async () => {
    if (!copyPlan || copyPending) return;
    setCopyPending(true);
    setCopyError(null);
    await Promise.resolve();
    try {
      const result = await copyPresetsFromWorkspace(copyPlan, copyStrategy);
      if (!result.ok) {
        setCopyError(result.error ?? 'The presets could not be copied.');
        return;
      }
      setCopySelectedPresetIds(new Set());
      setCopySourceWorkspaceId(null);
      setCopyChooserOpen(false);
      setCopyConfirmationOpen(false);
      setCopyConflictDecisionOpen(false);
      setCopyStrategy('reject');
      setCopyMessage(`${entriesForCopy(copyPlan, copyStrategy).length} preset${entriesForCopy(copyPlan, copyStrategy).length === 1 ? '' : 's'} copied to ${workspaceName}.`);
    } catch {
      setCopyError('The presets could not be copied.');
    } finally {
      setCopyPending(false);
    }
  };

  const reviewTransfer = () => {
    if (!transferPlan || transferPlan.entries.length === 0) return;
    setTransferError(null);
    if (transferPlan.conflicts.length > 0) {
      setTransferConflictDecisionOpen(true);
      return;
    }
    setTransferStrategy('reject');
    setTransferConfirmationOpen(true);
  };

  const confirmTransfer = async () => {
    if (!transferPlan || transferPending) return;
    setTransferPending(true);
    setTransferError(null);
    await Promise.resolve();
    try {
      const result = await transferPresets(transferPlan, transferStrategy);
      if (!result.ok) {
        setTransferError(result.error ?? 'The preset transfer could not be completed.');
        return;
      }
      setSelectedPresetIds(new Set());
      setTransferConfirmationOpen(false);
      setTransferMode(null);
      setDestinationWorkspaceIds(new Set());
      setTransferStrategy('reject');
      setTransferConflictDecisionOpen(false);
    } catch {
      setTransferError('The preset transfer could not be completed.');
    } finally {
      setTransferPending(false);
    }
  };

  return (
    <div
      className="preset-library-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeLibrary();
      }}
    >
      <section ref={libraryRef} className="preset-library" role="dialog" aria-modal="true" aria-labelledby="preset-library-title" aria-busy={libraryBusy}>
        <PresetLibraryHeader
          presets={presets}
          activePresetId={activePresetId}
          activePresetDirty={activePresetDirty}
          applyingPresetId={applyingPresetId}
          busy={libraryBusy}
          onClose={closeLibrary}
        />

        {deleteError && <p className="preset-library-feedback is-error" role="alert">{deleteError}</p>}
        {copyMessage && <p className="preset-library-status" role="status" aria-live="polite">{copyMessage}</p>}

        <div className="preset-library-toolbar">
          {presets.length > 0 && (
            <div className="preset-library-search-row">
              <label className="preset-search preset-library-search">
                <Search size={13} />
                <span className="visually-hidden">Search presets</span>
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  disabled={libraryBusy}
                  placeholder="Search by name, cluster or namespace..."
                />
                {query && (
                  <button type="button" className="preset-search-clear" onClick={() => setQuery('')} aria-label="Clear preset search" disabled={libraryBusy}>
                    <X size={12} />
                  </button>
                )}
              </label>
            </div>
          )}

          {presets.length > 0 && (
            <div className="preset-selection-controls" role="group" aria-label="Preset selection">
              <label className="preset-selection-toggle">
                <input
                  type="checkbox"
                  id="preset-select-all"
                  checked={selectionState.allVisibleSelected}
                  ref={(element) => { if (element) element.indeterminate = selectionState.someVisibleSelected; }}
                  onChange={() => setSelectedPresetIds((current) => toggleVisiblePresetSelection(current, visiblePresetIds))}
                  disabled={libraryBusy || visiblePresetIds.length === 0}
                  aria-label={query.trim() ? 'Select visible presets' : 'Select all presets'}
                />
                <span>{selectionState.allVisibleSelected ? (query.trim() ? 'Clear visible' : 'Clear all') : (query.trim() ? 'Select visible' : 'Select all')}</span>
              </label>
              {selectedPresetIds.size > 0 && (
                <>
                  <span className="preset-selection-count" role="status">{selectedPresetIds.size} selected</span>
                  <button type="button" className="text-button preset-selection-clear" onClick={() => setSelectedPresetIds(new Set())} disabled={libraryBusy}>Clear selection</button>
                </>
              )}
            </div>
          )}

          {selectedPresetIds.size > 0 && (
            <div className="preset-batch-actions" role="group" aria-label="Selected preset actions">
              <div className="preset-batch-transfer-actions">
                <button
                  type="button"
                  className="text-button preset-transfer-action"
                  onClick={(event) => beginTransfer('copy', event.currentTarget)}
                  disabled={libraryBusy}
                >
                  <Layers size={12} /> Copy to workspaces
                </button>
                <button
                  type="button"
                  className="text-button preset-transfer-action"
                  onClick={(event) => beginTransfer('move', event.currentTarget)}
                  disabled={libraryBusy}
                >
                  <Layers size={12} /> Move to workspaces
                </button>
              </div>
              <div className="preset-batch-destructive-actions">
                <button
                  type="button"
                  className="text-button danger-text preset-delete-selected"
                  onClick={(event) => {
                    setDeleteError(null);
                    deleteTriggerRef.current = event.currentTarget;
                    setDeleteIntent({
                      kind: 'selected',
                      ids: [...selectedPresetIds],
                      presets: presets.filter((preset) => selectedPresetIds.has(preset.id)),
                      trigger: event.currentTarget,
                    });
                  }}
                  disabled={libraryBusy}
                >
                  <Trash2 size={12} /> Delete selected
                </button>
              </div>
            </div>
          )}

          <div className="preset-library-cross-workspace-actions">
            <button
              type="button"
              className="text-button preset-transfer-action"
              onClick={(event) => beginCopy(event.currentTarget)}
              disabled={libraryBusy || workspaces.length < 2}
              title={workspaces.length < 2 ? 'Create another Workspace first' : 'Copy presets from another Workspace'}
            >
              <Layers size={12} /> Copy from Workspace
            </button>
          </div>
        </div>

        <div className="preset-library-list" role="group" aria-label="Saved presets">
          {visiblePresets.map((preset) => {
            const active = preset.id === activePresetId;
            return (
              <div className={`preset-library-item ${active ? 'is-active' : ''}`} key={preset.id}>
                <input
                  type="checkbox"
                  id={`preset-select-${preset.id}`}
                  className="preset-selection-checkbox"
                  checked={selectedPresetIds.has(preset.id)}
                  onChange={() => setSelectedPresetIds((current) => {
                    const next = new Set(current);
                    if (next.has(preset.id)) next.delete(preset.id);
                    else next.add(preset.id);
                    return next;
                  })}
                  disabled={libraryBusy}
                  aria-label={`Select preset ${preset.name}`}
                />
                <button
                  type="button"
                  className="preset-library-apply"
                  onClick={() => onApply(preset.id)}
                  disabled={libraryBusy}
                  aria-busy={applyingPresetId === preset.id}
                >
                  <Bookmark size={14} />
                  <span className="preset-text">
                    <strong>{preset.name}</strong>
                    <small>{describePreset(preset)}</small>
                    {preset.description && <em>{preset.description}</em>}
                  </span>
                </button>
                {active && <span className="preset-library-active-label">{activePresetDirty ? 'Edited' : 'Active'}</span>}
                <button type="button" className="icon-button subtle" onClick={() => onEdit(preset.id)} aria-label={`Edit preset ${preset.name}`} title={`Edit ${preset.name}`} disabled={libraryBusy}>
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  className="icon-button subtle danger"
                  onClick={(event) => {
                    setDeleteError(null);
                    deleteTriggerRef.current = event.currentTarget;
                    setDeleteIntent({ kind: 'selected', ids: [preset.id], presets: [preset], trigger: event.currentTarget });
                  }}
                  aria-label={`Remove preset ${preset.name}`}
                  title={`Remove ${preset.name}`}
                  disabled={libraryBusy}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
          {presets.length === 0 && <p className="sidebar-hint">Save target combinations you use often.</p>}
          {presets.length > 0 && visiblePresets.length === 0 && <p className="sidebar-hint">No preset matches the search.</p>}
        </div>

        {deleteIntent && (
          <PresetDeleteConfirmation
            intent={deleteIntent}
            activePresetId={activePresetId}
            workspaceName={workspaceName}
            pending={deletePending}
            error={deleteError}
            onCancel={() => {
              if (!deletePending) setDeleteIntent(null);
            }}
            onConfirm={async () => {
              if (deletePending) return;
              setDeletePending(true);
              setDeleteError(null);
              try {
                const currentState = useOpsFlowStore.getState();
                if (deleteIntent.ids.some((id) => !currentState.presets.some((preset) => preset.id === id))
                  || !deletePresets(deleteIntent.ids, currentState.activeWorkspaceId)) {
                  setDeleteError('One or more selected presets are no longer available.');
                  return;
                }
                setSelectedPresetIds(new Set());
                setDeleteIntent(null);
              } catch {
                setDeleteError('The preset could not be deleted.');
              } finally {
                setDeletePending(false);
              }
            }}
            restoreFocusRef={deleteTriggerRef}
            fallbackFocusRef={libraryRef}
          />
        )}
        {transferMode && sourceWorkspace && (
          <PresetTransferChooser
            mode={transferMode}
            sourceWorkspace={sourceWorkspace}
            selectedPresets={selectedPresets}
            destinationWorkspaces={destinationWorkspaces}
            destinationWorkspaceIds={destinationWorkspaceIds}
            plan={transferPlan}
            error={transferError}
            pending={transferPending}
            onModeChange={(mode) => {
              if (transferPending) return;
              setTransferMode(mode);
              setTransferStrategy('reject');
              setTransferConflictDecisionOpen(false);
              setTransferConfirmationOpen(false);
              setTransferError(null);
            }}
            onToggleDestination={(id) => {
              if (transferPending) return;
              setDestinationWorkspaceIds((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
              setTransferConfirmationOpen(false);
              setTransferConflictDecisionOpen(false);
              setTransferError(null);
            }}
            onReview={reviewTransfer}
            onCancel={() => {
              if (transferPending) return;
              setTransferMode(null);
              setDestinationWorkspaceIds(new Set());
              setTransferStrategy('reject');
              setTransferConflictDecisionOpen(false);
              setTransferConfirmationOpen(false);
              setTransferError(null);
            }}
          />
        )}
        {transferConflictDecisionOpen && transferPlan && sourceWorkspace && (
          <PresetTransferConflictDecision
            plan={transferPlan}
            mode={transferMode ?? 'copy'}
            onCancel={() => setTransferConflictDecisionOpen(false)}
            onChoose={(strategy) => {
              setTransferStrategy(strategy);
              setTransferConflictDecisionOpen(false);
              setTransferConfirmationOpen(true);
            }}
          />
        )}
        {transferConfirmationOpen && transferPlan && sourceWorkspace && (
          <PresetTransferConfirmation
            plan={transferPlan}
            strategy={transferStrategy}
            sourceWorkspace={sourceWorkspace}
            destinationWorkspaces={destinationWorkspaces}
            selectedPresets={selectedPresets}
            pending={transferPending}
            error={transferError}
            onCancel={() => {
              if (!transferPending) setTransferConfirmationOpen(false);
            }}
            onConfirm={confirmTransfer}
            restoreFocusRef={transferTriggerRef}
            fallbackFocusRef={libraryRef}
          />
        )}
        {copyChooserOpen && (
          <PresetCopyChooser
            destinationWorkspace={workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null}
            sourceWorkspaces={destinationWorkspaces}
            sourceWorkspaceId={copySourceWorkspaceId}
            selectedPresetIds={copySelectedPresetIds}
            plan={copyPlan}
            error={copyError}
            pending={copyPending}
            onSelectSource={(id) => {
              if (copyPending) return;
              setCopySourceWorkspaceId(id);
              setCopySelectedPresetIds(new Set());
              setCopyError(null);
            }}
            onTogglePreset={(id) => {
              if (copyPending) return;
              setCopySelectedPresetIds((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
              setCopyError(null);
            }}
            onReview={reviewCopy}
            onCancel={() => {
              if (copyPending) return;
              setCopyChooserOpen(false);
              setCopySourceWorkspaceId(null);
              setCopySelectedPresetIds(new Set());
              setCopyError(null);
            }}
          />
        )}
        {copyConflictDecisionOpen && copyPlan && copySourceWorkspace && (
          <PresetCopyConflictDecision
            plan={copyPlan}
            onCancel={() => setCopyConflictDecisionOpen(false)}
            onChoose={(strategy) => {
              setCopyStrategy(strategy);
              setCopyConflictDecisionOpen(false);
              setCopyConfirmationOpen(true);
            }}
          />
        )}
        {copyConfirmationOpen && copyPlan && copySourceWorkspace && (
          <PresetCopyConfirmation
            plan={copyPlan}
            strategy={copyStrategy}
            sourceWorkspace={copySourceWorkspace}
            destinationWorkspace={workspaces.find((workspace) => workspace.id === activeWorkspaceId)!}
            selectedPresets={copySelectedPresets}
            pending={copyPending}
            error={copyError}
            onCancel={() => {
              if (!copyPending) setCopyConfirmationOpen(false);
            }}
            onConfirm={confirmCopy}
            restoreFocusRef={copyTriggerRef}
            fallbackFocusRef={libraryRef}
          />
        )}
      </section>
    </div>
  );
}

function PresetDeleteConfirmation({
  intent,
  activePresetId,
  workspaceName,
  pending,
  error,
  onCancel,
  onConfirm,
  restoreFocusRef,
  fallbackFocusRef,
}: {
  intent: PresetDeleteIntent;
  activePresetId: string | null;
  workspaceName: string;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  restoreFocusRef: { current: HTMLElement | null };
  fallbackFocusRef: { current: HTMLElement | null };
}) {
  const selectedPresets = intent.presets;
  const selectedIncludesActive = selectedPresets.some((selectedPreset) => selectedPreset.id === activePresetId);
  const selectedTargetCount = selectedPresets.reduce((total, selectedPreset) => total + selectedPreset.targets.length, 0);
  const description = `This will remove ${selectedPresets.length} saved preset${selectedPresets.length === 1 ? '' : 's'} from ${workspaceName}. Current targets, pods, filters, logs, query state, and other operational view state will remain unchanged${selectedIncludesActive ? '; the active saved reference will be cleared while live targets remain' : ''}.`;

  return (
    <DestructiveConfirmation
      title={`Delete ${selectedPresets.length} selected preset${selectedPresets.length === 1 ? '' : 's'}?`}
      description={description}
      context={(
        <>
          <p><strong>{selectedPresets.length} saved preset{selectedPresets.length === 1 ? '' : 's'}</strong> in the Active Workspace.</p>
          <p><strong>{selectedTargetCount} target{selectedTargetCount === 1 ? '' : 's'}</strong> across the selected presets.</p>
          <ul>{selectedPresets.map((selectedPreset) => <li key={selectedPreset.id}>{selectedPreset.name}</li>)}</ul>
        </>
      )}
      confirmLabel="Delete selected"
      pending={pending}
      error={error}
      onCancel={onCancel}
      onConfirm={onConfirm}
      restoreFocusRef={restoreFocusRef}
      fallbackFocusRef={fallbackFocusRef}
    />
  );
}

function PresetTransferChooser({
  mode,
  sourceWorkspace,
  selectedPresets,
  destinationWorkspaces,
  destinationWorkspaceIds,
  plan,
  error,
  pending,
  onModeChange,
  onToggleDestination,
  onReview,
  onCancel,
}: {
  mode: TransferMode;
  sourceWorkspace: Workspace;
  selectedPresets: Preset[];
  destinationWorkspaces: Workspace[];
  destinationWorkspaceIds: Set<string>;
  plan: TransferPlan | null;
  error: string | null;
  pending: boolean;
  onModeChange: (mode: TransferMode) => void;
  onToggleDestination: (id: string) => void;
  onReview: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!pending) onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="preset-dialog-layer" onMouseDown={(event) => !pending && event.target === event.currentTarget && onCancel()}>
      <section ref={dialogRef} className="preset-secondary-dialog preset-transfer-chooser" role="dialog" aria-modal="true" aria-labelledby="preset-transfer-title" aria-busy={pending} tabIndex={-1} onKeyDown={handleKeyDown}>
        <div className="preset-secondary-dialog-header">
          <div>
            <span className="eyebrow">Workspace transfer</span>
            <h3 id="preset-transfer-title">Choose destinations</h3>
          </div>
          <button type="button" className="icon-button subtle" onClick={onCancel} aria-label="Close Workspace transfer" disabled={pending}><X size={15} /></button>
        </div>
        <div className="preset-transfer-mode" role="group" aria-label="Transfer mode">
          <button type="button" className={`secondary-button ${mode === 'copy' ? 'is-selected' : ''}`} onClick={() => onModeChange('copy')} disabled={pending}>Copy</button>
          <button type="button" className={`secondary-button ${mode === 'move' ? 'is-selected' : ''}`} onClick={() => onModeChange('move')} disabled={pending}>Move</button>
        </div>
        <p className="preset-dialog-summary">
          {selectedPresets.length} selected preset{selectedPresets.length === 1 ? '' : 's'} from <strong>{sourceWorkspace.name}</strong>. Select one or more Workspaces.
        </p>
        <div className="preset-transfer-workspace-list" role="group" aria-label="Transfer destination Workspaces">
          <label className="preset-transfer-workspace is-source">
            <input type="checkbox" checked disabled aria-label={`${sourceWorkspace.name}, source Workspace`} />
            <span><strong>{sourceWorkspace.name}</strong><small>Source Workspace · {sourceWorkspace.presets.length} preset{sourceWorkspace.presets.length === 1 ? '' : 's'} · not eligible as destination</small></span>
          </label>
          {destinationWorkspaces.map((workspace) => (
            <label className="preset-transfer-workspace" key={workspace.id}>
              <input
                type="checkbox"
                checked={destinationWorkspaceIds.has(workspace.id)}
                onChange={() => onToggleDestination(workspace.id)}
                disabled={pending}
                aria-label={`Select destination Workspace ${workspace.name}`}
              />
              <span><strong>{workspace.name}</strong><small>{workspace.presets.length} preset{workspace.presets.length === 1 ? '' : 's'}</small></span>
            </label>
          ))}
          {destinationWorkspaces.length === 0 && <p className="sidebar-hint">Create another Workspace before transferring presets.</p>}
        </div>
        {plan && plan.conflicts.length > 0 && (
          <div className="preset-transfer-conflict-summary" role="status">
            <strong>{plan.conflicts.length} destination conflict{plan.conflicts.length === 1 ? '' : 's'} found.</strong>
            <span>{entriesForTransfer(plan, 'ignore').length} record{entriesForTransfer(plan, 'ignore').length === 1 ? '' : 's'} can transfer without replacing anything.</span>
            <ul>{plan.conflicts.map((conflict, index) => <li key={`${conflict.kind}-${conflict.sourcePresetId ?? 'catalog'}-${index}`}>{conflict.message}</li>)}</ul>
          </div>
        )}
        {error && <p className="preset-library-feedback is-error" role="alert" aria-live="polite">{error}</p>}
        {plan && plan.conflicts.length === 0 && destinationWorkspaceIds.size > 0 && (
          <p className="preset-library-status" role="status" aria-live="polite">{plan.entries.length} destination record{plan.entries.length === 1 ? '' : 's'} ready for review.</p>
        )}
        <div className="preset-secondary-dialog-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={pending}>Cancel</button>
          <button type="button" className="primary-button" onClick={onReview} disabled={pending || !plan || plan.entries.length === 0}>
            <Check size={13} /> {plan?.conflicts.length ? 'Review conflict options' : `Review ${mode}`}
          </button>
        </div>
      </section>
    </div>
  );
}

function PresetTransferConflictDecision({
  plan,
  mode,
  onCancel,
  onChoose,
}: {
  plan: TransferPlan;
  mode: TransferMode;
  onCancel: () => void;
  onChoose: (strategy: 'ignore' | 'overwrite') => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const transferableWithoutOverwrite = entriesForTransfer(plan, 'ignore');
  const conflictMessages = plan.conflicts.map((conflict, index) => (
    <li key={`${conflict.kind}-${conflict.sourcePresetId ?? 'catalog'}-${index}`}>{conflict.message}</li>
  ));

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }, []);

  return (
    <div className="preset-dialog-layer" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section ref={dialogRef} className="preset-secondary-dialog preset-transfer-conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="preset-transfer-conflict-title">
        <div className="preset-secondary-dialog-header">
          <div>
            <span className="eyebrow">Review destination conflicts</span>
            <h3 id="preset-transfer-conflict-title">Choose how to continue</h3>
          </div>
          <button type="button" className="icon-button subtle" onClick={onCancel} aria-label="Cancel conflict decision"><X size={15} /></button>
        </div>
        <p className="preset-dialog-summary">
          {plan.conflicts.length} conflict{plan.conflicts.length === 1 ? '' : 's'} found. Choose how to handle them before confirming the {mode}.
        </p>
        <div className="preset-transfer-conflict-options">
          <button type="button" className="secondary-button" onClick={() => onChoose('ignore')}>
            <span className="preset-transfer-conflict-option-title"><X size={13} /> <strong>Ignore conflicts</strong></span>
            <small>Transfer {transferableWithoutOverwrite.length} preset{transferableWithoutOverwrite.length === 1 ? '' : 's'} without conflict. Leave the rest at the source.</small>
          </button>
          <button type="button" className="primary-button" onClick={() => onChoose('overwrite')}>
            <span className="preset-transfer-conflict-option-title"><Check size={13} /> <strong>Overwrite conflicts</strong></span>
            <small>Transfer all {plan.entries.length} presets and replace matching presets in the destination.</small>
          </button>
        </div>
        <div className="preset-transfer-conflict-details">
          <strong>Conflicting presets</strong>
          <ul className="preset-transfer-conflict-list">{conflictMessages}</ul>
        </div>
        <div className="preset-secondary-dialog-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
        </div>
      </section>
    </div>
  );
}

function PresetTransferConfirmation({
  plan,
  strategy,
  sourceWorkspace,
  destinationWorkspaces,
  selectedPresets,
  pending,
  error,
  onCancel,
  onConfirm,
  restoreFocusRef,
  fallbackFocusRef,
}: {
  plan: TransferPlan;
  strategy: TransferConflictStrategy;
  sourceWorkspace: Workspace;
  destinationWorkspaces: Workspace[];
  selectedPresets: Preset[];
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  restoreFocusRef: { current: HTMLElement | null };
  fallbackFocusRef: { current: HTMLElement | null };
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const destinationNames = destinationWorkspaces
    .filter((workspace) => plan.intent.destinationWorkspaceIds.includes(workspace.id))
    .map((workspace) => workspace.name);
  const effectiveEntries = entriesForTransfer(plan, strategy);
  const effectiveSourceIds = new Set(effectiveEntries.map((entry) => entry.sourcePresetId));

  useEffect(() => {
    cancelRef.current?.focus();
    return () => {
      const trigger = restoreFocusRef.current;
      const fallback = fallbackFocusRef.current;
      if (trigger && document.contains(trigger)) trigger.focus();
      else if (fallback && document.contains(fallback)) fallback.focus();
    };
  }, [fallbackFocusRef, restoreFocusRef]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!pending) onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="preset-dialog-layer destructive-confirmation-layer" onMouseDown={(event) => !pending && event.target === event.currentTarget && onCancel()}>
      <section ref={dialogRef} className="preset-secondary-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={pending} tabIndex={-1} onKeyDown={handleKeyDown} onMouseDown={(event) => event.stopPropagation()}>
        <div className="preset-secondary-dialog-header">
          <div><span className="eyebrow">Review Workspace transfer</span><h3 id={titleId}>{plan.intent.mode === 'copy' ? 'Copy presets?' : 'Move presets?'}</h3></div>
          <button type="button" className="icon-button subtle" onClick={onCancel} aria-label="Cancel Workspace transfer" disabled={pending}><X size={15} /></button>
        </div>
        <p className="preset-dialog-summary" id={descriptionId}>
          {plan.intent.mode === 'copy'
            ? 'The source records will remain unchanged.'
            : 'Destination records will be created before the selected source records are removed in one catalog commit.'}
        </p>
        <div className="destructive-confirmation-context">
          <p><strong>Source:</strong> {sourceWorkspace.name}</p>
          <p><strong>Presets:</strong> {selectedPresets.length} selected</p>
          <p><strong>Destinations:</strong> {destinationNames.length} Workspace{destinationNames.length === 1 ? '' : 's'}: {destinationNames.join(', ')}</p>
          <p><strong>Records to transfer:</strong> {effectiveEntries.length} of {plan.entries.length}</p>
          {plan.conflicts.length > 0 && <p><strong>Conflicts:</strong> {plan.conflicts.length} ({strategy === 'overwrite' ? 'overwrite selected' : 'ignored'})</p>}
          {plan.intent.mode === 'move' && <p><strong>Source records removed:</strong> {effectiveSourceIds.size}; only presets transferred to at least one destination are removed.</p>}
          <ul>{selectedPresets.map((preset) => <li key={preset.id}>{preset.name}</li>)}</ul>
        </div>
        {error && <p className="preset-library-feedback is-error" role="alert" aria-live="polite">{error}</p>}
        <div className="preset-secondary-dialog-actions">
          <button ref={cancelRef} type="button" className="secondary-button" onClick={onCancel} disabled={pending}>Cancel</button>
          <button type="button" className="primary-button" onClick={() => void onConfirm()} disabled={pending}>
            {pending ? <Loader size={13} className="spinning" /> : <Check size={13} />}
            {pending ? 'Transferring...' : `Confirm ${plan.intent.mode}`}
          </button>
        </div>
      </section>
    </div>
  );
}

function PresetCopyChooser({
  destinationWorkspace,
  sourceWorkspaces,
  sourceWorkspaceId,
  selectedPresetIds,
  plan,
  error,
  pending,
  onSelectSource,
  onTogglePreset,
  onReview,
  onCancel,
}: {
  destinationWorkspace: Workspace | null;
  sourceWorkspaces: Workspace[];
  sourceWorkspaceId: string | null;
  selectedPresetIds: Set<string>;
  plan: CopyPlan | null;
  error: string | null;
  pending: boolean;
  onSelectSource: (id: string) => void;
  onTogglePreset: (id: string) => void;
  onReview: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const [query, setQuery] = useState('');
  const sourceWorkspace = sourceWorkspaces.find((workspace) => workspace.id === sourceWorkspaceId);
  const visiblePresets = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (sourceWorkspace?.presets ?? []).filter((preset) => {
      if (!needle) return true;
      return [preset.name, preset.description ?? '', describePreset(preset)].join(' ').toLocaleLowerCase().includes(needle);
    });
  }, [query, sourceWorkspace]);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)')?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!pending) onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])');
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="preset-dialog-layer" onMouseDown={(event) => !pending && event.target === event.currentTarget && onCancel()}>
      <section ref={dialogRef} className="preset-secondary-dialog preset-transfer-chooser" role="dialog" aria-modal="true" aria-labelledby="preset-copy-title" aria-busy={pending} tabIndex={-1} onKeyDown={handleKeyDown}>
        <div className="preset-secondary-dialog-header">
          <div><span className="eyebrow">Preset library</span><h3 id="preset-copy-title">Copy from another Workspace</h3></div>
          <button type="button" className="icon-button subtle" onClick={onCancel} aria-label="Close preset copy" disabled={pending}><X size={15} /></button>
        </div>
        <p className="preset-dialog-summary">
          Destination: <strong>{destinationWorkspace?.name ?? 'Active Workspace'}</strong>. Choose a source Workspace and the presets to copy.
        </p>
        <div className="preset-transfer-workspace-list" role="radiogroup" aria-label="Source Workspaces">
          {sourceWorkspaces.map((workspace) => (
            <label className={`preset-transfer-workspace ${workspace.id === sourceWorkspaceId ? 'is-selected' : ''}`} key={workspace.id}>
              <input
                type="radio"
                name="preset-copy-source"
                checked={workspace.id === sourceWorkspaceId}
                onChange={() => onSelectSource(workspace.id)}
                disabled={pending}
                aria-label={`Select source Workspace ${workspace.name}`}
              />
              <span><strong>{workspace.name}</strong><small>{workspace.presets.length} preset{workspace.presets.length === 1 ? '' : 's'}</small></span>
            </label>
          ))}
          {sourceWorkspaces.length === 0 && <p className="sidebar-hint">Create another Workspace before copying presets.</p>}
        </div>
        {sourceWorkspace && (
          <>
            <label className="preset-search preset-library-search">
              <Search size={13} />
              <span className="visually-hidden">Search source presets</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} disabled={pending} placeholder="Search source presets..." />
            </label>
            <div className="preset-transfer-workspace-list" role="group" aria-label={`Presets in ${sourceWorkspace.name}`}>
              {visiblePresets.map((preset) => (
                <label className="preset-transfer-workspace" key={preset.id}>
                  <input type="checkbox" checked={selectedPresetIds.has(preset.id)} onChange={() => onTogglePreset(preset.id)} disabled={pending} aria-label={`Select preset ${preset.name}`} />
                  <span><strong>{preset.name}</strong><small>{describePreset(preset)}</small></span>
                </label>
              ))}
              {sourceWorkspace.presets.length === 0 && <p className="sidebar-hint">This Workspace has no saved presets.</p>}
              {sourceWorkspace.presets.length > 0 && visiblePresets.length === 0 && <p className="sidebar-hint">No source preset matches the search.</p>}
            </div>
          </>
        )}
        {plan && plan.conflicts.length > 0 && (
          <div className="preset-transfer-conflict-summary" role="status">
            <strong>{plan.conflicts.length} conflict{plan.conflicts.length === 1 ? '' : 's'} found.</strong>
            <span>{entriesForCopy(plan, 'ignore').length} preset{entriesForCopy(plan, 'ignore').length === 1 ? '' : 's'} can be copied without replacing anything.</span>
          </div>
        )}
        {error && <p className="preset-library-feedback is-error" role="alert" aria-live="polite">{error}</p>}
        {plan && plan.conflicts.length === 0 && <p className="preset-library-status" role="status" aria-live="polite">{plan.entries.length} preset{plan.entries.length === 1 ? '' : 's'} ready for review.</p>}
        <div className="preset-secondary-dialog-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={pending}>Cancel</button>
          <button type="button" className="primary-button" onClick={onReview} disabled={pending || !plan || plan.entries.length === 0}>
            <Check size={13} /> {plan?.conflicts.length ? 'Review conflicts' : 'Review copy'}
          </button>
        </div>
      </section>
    </div>
  );
}

function PresetCopyConflictDecision({
  plan,
  onCancel,
  onChoose,
}: {
  plan: CopyPlan;
  onCancel: () => void;
  onChoose: (strategy: 'ignore' | 'overwrite') => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const copyable = entriesForCopy(plan, 'ignore');
  const conflictMessages = plan.conflicts.map((conflict, index) => (
    <li key={`${conflict.kind}-${conflict.sourcePresetId ?? 'catalog'}-${index}`}>{conflict.message}</li>
  ));

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }, []);

  return (
    <div className="preset-dialog-layer" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section ref={dialogRef} className="preset-secondary-dialog preset-transfer-conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="preset-copy-conflict-title">
        <div className="preset-secondary-dialog-header">
          <div><span className="eyebrow">Review copy conflicts</span><h3 id="preset-copy-conflict-title">Choose how to continue</h3></div>
          <button type="button" className="icon-button subtle" onClick={onCancel} aria-label="Cancel copy conflict decision"><X size={15} /></button>
        </div>
        <p className="preset-dialog-summary">{plan.conflicts.length} conflict{plan.conflicts.length === 1 ? '' : 's'} found. Choose how to handle them before copying.</p>
        <div className="preset-transfer-conflict-options">
          <button type="button" className="secondary-button" onClick={() => onChoose('ignore')}>
            <span className="preset-transfer-conflict-option-title"><X size={13} /> <strong>Ignore conflicts</strong></span>
            <small>Copy {copyable.length} preset{copyable.length === 1 ? '' : 's'} without replacing existing destination records.</small>
          </button>
          <button type="button" className="primary-button" onClick={() => onChoose('overwrite')}>
            <span className="preset-transfer-conflict-option-title"><Check size={13} /> <strong>Overwrite conflicts</strong></span>
            <small>Copy all {plan.entries.length} selected presets and replace matching destination records.</small>
          </button>
        </div>
        <div className="preset-transfer-conflict-details">
          <strong>Conflicting presets</strong>
          <ul className="preset-transfer-conflict-list">{conflictMessages}</ul>
        </div>
        <div className="preset-secondary-dialog-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button></div>
      </section>
    </div>
  );
}

function PresetCopyConfirmation({
  plan,
  strategy,
  sourceWorkspace,
  destinationWorkspace,
  selectedPresets,
  pending,
  error,
  onCancel,
  onConfirm,
  restoreFocusRef,
  fallbackFocusRef,
}: {
  plan: CopyPlan;
  strategy: CopyConflictStrategy;
  sourceWorkspace: Workspace;
  destinationWorkspace: Workspace;
  selectedPresets: Preset[];
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  restoreFocusRef: { current: HTMLElement | null };
  fallbackFocusRef: { current: HTMLElement | null };
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const effectiveEntries = entriesForCopy(plan, strategy);

  useEffect(() => {
    cancelRef.current?.focus();
    return () => {
      const trigger = restoreFocusRef.current;
      const fallback = fallbackFocusRef.current;
      if (trigger && document.contains(trigger)) trigger.focus();
      else if (fallback && document.contains(fallback)) fallback.focus();
    };
  }, [fallbackFocusRef, restoreFocusRef]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!pending) onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])');
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="preset-dialog-layer destructive-confirmation-layer" onMouseDown={(event) => !pending && event.target === event.currentTarget && onCancel()}>
      <section ref={dialogRef} className="preset-secondary-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={pending} tabIndex={-1} onKeyDown={handleKeyDown} onMouseDown={(event) => event.stopPropagation()}>
        <div className="preset-secondary-dialog-header">
          <div><span className="eyebrow">Review preset copy</span><h3 id={titleId}>Copy presets?</h3></div>
          <button type="button" className="icon-button subtle" onClick={onCancel} aria-label="Cancel preset copy" disabled={pending}><X size={15} /></button>
        </div>
        <p className="preset-dialog-summary" id={descriptionId}>The source records will remain unchanged. The current view will stay as it is.</p>
        <div className="destructive-confirmation-context">
          <p><strong>Source:</strong> {sourceWorkspace.name}</p>
          <p><strong>Destination:</strong> {destinationWorkspace.name}</p>
          <p><strong>Presets:</strong> {effectiveEntries.length} of {plan.entries.length} will be copied</p>
          {plan.conflicts.length > 0 && <p><strong>Conflicts:</strong> {plan.conflicts.length} ({strategy === 'overwrite' ? 'overwrite selected' : 'ignored'})</p>}
          <ul>{selectedPresets.map((preset) => <li key={preset.id}>{preset.name}</li>)}</ul>
        </div>
        {error && <p className="preset-library-feedback is-error" role="alert" aria-live="polite">{error}</p>}
        <div className="preset-secondary-dialog-actions">
          <button ref={cancelRef} type="button" className="secondary-button" onClick={onCancel} disabled={pending}>Cancel</button>
          <button type="button" className="primary-button" onClick={() => void onConfirm()} disabled={pending}>
            {pending ? <Loader size={13} className="spinning" /> : <Check size={13} />}
            {pending ? 'Copying...' : 'Confirm copy'}
          </button>
        </div>
      </section>
    </div>
  );
}

interface EditablePreset {
  id: string;
  name: string;
  description?: string;
  targets: { cluster: string; namespace: string }[];
}

interface PresetEditorProps {
  mode: 'create' | 'edit';
  preset: EditablePreset | null;
  presets?: Pick<Preset, 'name'>[];
  contexts: string[];
  onClose: () => void;
  onSave: (preset: EditablePreset) => void;
}

function PresetEditor({ mode, preset, presets = [], contexts, onClose, onSave }: PresetEditorProps) {
  const namespaces = useOpsFlowStore((s) => s.namespaces);
  const namespacesLoading = useOpsFlowStore((s) => s.namespacesLoading);
  const namespacesError = useOpsFlowStore((s) => s.namespacesError);
  const loadNamespaces = useOpsFlowStore((s) => s.loadNamespaces);
  const dialogRef = useRef<HTMLElement>(null);
  const [name, setName] = useState(preset?.name ?? '');
  const [description, setDescription] = useState(preset?.description ?? '');
  const [targets, setTargets] = useState(() => preset?.targets.map((target) => ({ ...target })) ?? []);
  const [newCluster, setNewCluster] = useState(
    preset?.targets[0]?.cluster ?? contexts[0] ?? '',
  );
  const [newNamespace, setNewNamespace] = useState('');
  const [targetFeedback, setTargetFeedback] = useState('');
  useDialogFocus(Boolean(preset), dialogRef, undefined, 'input');

  const clusterOptions = useMemo(
    () => [...new Set([...contexts, ...targets.map((target) => target.cluster)])],
    [contexts, targets],
  );
  const namespaceClusters = useMemo(
    () => [...new Set([...targets.map((target) => target.cluster), newCluster].filter(Boolean))].sort(),
    [newCluster, targets],
  );
  const namespaceClusterKey = namespaceClusters.join('|');

  useEffect(() => {
    if (mode === 'create') return;
    void loadNamespaces(namespaceClusters);
  }, [loadNamespaces, mode, namespaceClusterKey]);

  useEffect(() => {
    if (!preset) return;
    setName(preset.name);
    setDescription(preset.description ?? '');
    setTargets(preset.targets.map((target) => ({ ...target })));
    setNewCluster(preset.targets[0]?.cluster ?? contexts[0] ?? '');
    setTargetFeedback('');
  }, [contexts, mode, preset]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const availableNamespaces = useMemo(() => {
    const byName = new Map(namespaces.map((namespace) => [namespace.name, { ...namespace, clusters: [...namespace.clusters] }]));
    if (mode === 'create') {
      targets.forEach((target) => {
        const existing = byName.get(target.namespace);
        if (existing) {
          if (!existing.clusters.includes(target.cluster)) existing.clusters.push(target.cluster);
        } else {
          byName.set(target.namespace, { name: target.namespace, clusters: [target.cluster] });
        }
      });
    }
    return [...byName.values()];
  }, [mode, namespaces, targets]);

  if (!preset) return null;

  const namespacesForCluster = (cluster: string) =>
    availableNamespaces.filter((namespace) => namespace.clusters.includes(cluster));
  const isValidNamespace = (cluster: string, namespace: string) =>
    namespacesForCluster(cluster).some((item) => item.name === namespace.trim());
  const canAddTarget =
    newCluster.trim() !== '' && isValidNamespace(newCluster, newNamespace);
  const duplicateName = mode === 'create' && presets.some((item) =>
    item.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
  );
  const canSave = name.trim() !== '' && targets.length > 0 && targets.every(
    (target) => target.cluster.trim() !== '' && isValidNamespace(target.cluster, target.namespace),
  ) && !duplicateName;

  const updateTarget = (index: number, field: 'cluster' | 'namespace', value: string) => {
    setTargetFeedback('');
    setTargets((current) =>
      current.map((target, targetIndex) =>
        targetIndex === index ? { ...target, [field]: value } : target,
      ),
    );
  };

  const addTarget = () => {
    if (!canAddTarget) {
      setTargetFeedback('Choose a valid namespace for the selected cluster.');
      return;
    }
    const next = { cluster: newCluster.trim(), namespace: newNamespace.trim() };
    if (targets.some((target) => targetKey(target) === targetKey(next))) {
      setTargetFeedback('This cluster and namespace are already in the preset.');
      return;
    }
    setTargets((current) => [...current, next]);
    setNewNamespace('');
    setTargetFeedback('');
  };

  return (
    <div className="preset-editor-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        ref={dialogRef}
        className="preset-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preset-editor-title"
      >
        <div className="preset-editor-header">
          <div>
            <span className="eyebrow">Preset details</span>
            <h2 id="preset-editor-title">{mode === 'create' ? 'Save preset as new' : 'Edit preset'}</h2>
          </div>
          <button type="button" className="icon-button subtle" onClick={onClose} aria-label="Close preset editor">
            <X size={15} />
          </button>
        </div>

        <div className="preset-editor-fields">
          <label>
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </label>
          {duplicateName && (
            <p className="preset-editor-feedback" role="alert">
              <AlertTriangle size={12} /> A preset with this name already exists.
            </p>
          )}
          <label>
            <span>Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What is this preset used for?"
              rows={2}
            />
          </label>
        </div>

        <div className="preset-editor-section-label">
          <span>Targets <b>{targets.length}</b></span>
          <span className="preset-editor-hint">cluster + namespace</span>
        </div>

        <div className="preset-target-editor-list">
          {targets.map((target, index) => (
            <div className="preset-target-editor-row" key={`${targetKey(target)}-${index}`}>
              <select
                value={target.cluster}
                onChange={(event) => updateTarget(index, 'cluster', event.target.value)}
                aria-label={`Cluster for target ${index + 1}`}
              >
                {!clusterOptions.includes(target.cluster) && <option value={target.cluster}>{target.cluster}</option>}
                {clusterOptions.map((cluster) => <option key={cluster} value={cluster}>{cluster}</option>)}
              </select>
              <PresetNamespaceInput
                value={target.namespace}
                namespaces={namespacesForCluster(target.cluster)}
                loading={namespacesLoading}
                onChange={(value) => updateTarget(index, 'namespace', value)}
                ariaLabel={`Namespace for target ${index + 1}`}
              />
              <button
                type="button"
                className="icon-button subtle danger"
                onClick={() => setTargets((current) => current.filter((_, targetIndex) => targetIndex !== index))}
                aria-label={`Remove target ${targetKey(target)}`}
                title="Remove target"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        {mode === 'edit' && namespacesError && (
          <p className="preset-editor-feedback" role="alert">
            <AlertTriangle size={12} /> {namespacesError}
          </p>
        )}

        {mode === 'edit' && (
          <div className="preset-target-add-row">
            <select
              value={newCluster}
              onChange={(event) => {
                setNewCluster(event.target.value);
                setNewNamespace('');
                setTargetFeedback('');
              }}
              aria-label="New target cluster"
            >
              <option value="">Cluster</option>
              {clusterOptions.map((cluster) => <option key={cluster} value={cluster}>{cluster}</option>)}
            </select>
            <PresetNamespaceInput
              value={newNamespace}
              namespaces={namespacesForCluster(newCluster)}
              loading={namespacesLoading}
              onChange={(value) => {
                setNewNamespace(value);
                setTargetFeedback('');
              }}
              ariaLabel="New target namespace"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addTarget();
                }
              }}
            />
            <button type="button" className="secondary-button" onClick={addTarget} disabled={!canAddTarget}>
              <Plus size={13} /> Add
            </button>
          </div>
        )}

        {mode === 'edit' && targetFeedback && (
          <p className="preset-target-feedback" role="status">{targetFeedback}</p>
        )}

        <div className="preset-editor-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="primary-button"
            onClick={() => onSave({ id: preset.id, name, description, targets })}
            disabled={!canSave}
          >
            <Save size={13} /> {mode === 'create' ? 'Create preset' : 'Save changes'}
          </button>
        </div>
      </section>
    </div>
  );
}

interface PresetNamespaceInputProps {
  value: string;
  namespaces: NamespaceInfo[];
  loading: boolean;
  onChange: (value: string) => void;
  ariaLabel: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

function PresetNamespaceInput({
  value,
  namespaces,
  loading,
  onChange,
  ariaLabel,
  onKeyDown,
}: PresetNamespaceInputProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blurTimer = useRef<number | undefined>(undefined);
  const suggestions = useMemo(() => suggestNamespaces(namespaces, value, 1, 12), [namespaces, value]);
  const exactMatch = namespaces.some((namespace) => namespace.name === value.trim());

  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  const choose = (namespace: string) => {
    onChange(namespace);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, -1));
      return;
    }
    if (event.key === 'Enter' && open && activeIndex >= 0 && suggestions[activeIndex]) {
      event.preventDefault();
      choose(suggestions[activeIndex].name);
      return;
    }
    onKeyDown?.(event);
  };

  return (
    <div className="preset-namespace-input">
      <div className="preset-namespace-field">
        <input
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOpen(false), 140);
          }}
          onKeyDown={handleKeyDown}
          placeholder={loading ? 'Loading...' : 'Namespace'}
          aria-label={ariaLabel}
          aria-invalid={value.trim() !== '' && !exactMatch}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        {exactMatch && <Check size={12} className="preset-namespace-valid" aria-label="Valid namespace" />}
      </div>
      {open && (
        <div className="preset-namespace-suggestions" role="listbox">
          {suggestions.map((suggestion, index) => (
            <button
              type="button"
              key={suggestion.name}
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'is-active' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(suggestion.name)}
            >
              {suggestion.name}
            </button>
          ))}
          {suggestions.length === 0 && !loading && (
            <span className="preset-namespace-no-match">No valid namespace</span>
          )}
        </div>
      )}
    </div>
  );
}
