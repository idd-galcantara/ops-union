import type { RefObject } from 'react';
import { Bookmark, Check, ChevronDown, LayoutGrid, Loader, Save } from 'lucide-react';
import { describePreset, type Preset } from '../presets';
import type { Workspace } from '../workspaces';

interface WorkspaceQuickControlsProps {
  active: Workspace;
  activePreset?: Preset;
  activePresetId: string | null;
  activePresetDirty: boolean;
  quickPresets: Preset[];
  quickOpen: 'preset' | null;
  quickApplyingPresetId: string | null;
  managerBusy: boolean;
  quickBusy: boolean;
  quickMenuBusy: boolean;
  open: boolean;
  canUpdateActivePreset: boolean;
  quickControlsRef: RefObject<HTMLDivElement | null>;
  presetQuickTriggerRef: RefObject<HTMLButtonElement | null>;
  onOpenManager: () => void;
  onTogglePresetMenu: () => void;
  onSelectPreset: (id: string) => void;
  onOpenPresetLibrary: () => void;
  onUpdateActivePreset: () => void;
}

export function WorkspaceQuickControls({
  active,
  activePreset,
  activePresetId,
  activePresetDirty,
  quickPresets,
  quickOpen,
  quickApplyingPresetId,
  managerBusy,
  quickBusy,
  quickMenuBusy,
  open,
  canUpdateActivePreset,
  quickControlsRef,
  presetQuickTriggerRef,
  onOpenManager,
  onTogglePresetMenu,
  onSelectPreset,
  onOpenPresetLibrary,
  onUpdateActivePreset,
}: WorkspaceQuickControlsProps) {
  return (
    <div ref={quickControlsRef}>
      <div className="workspace-quick-controls">
        <button type="button" className="workspace-quick-trigger workspace-workspace-quick-trigger" onClick={onOpenManager} aria-expanded={open} aria-controls="workspace-manager" aria-haspopup="dialog" aria-label={`Workspace: ${active.name}`} disabled={managerBusy}>
          <span className="workspace-context-label">Workspace</span>
          <strong title={active.name}>{active.name}</strong>
          <LayoutGrid size={13} aria-hidden="true" />
        </button>
        <div className="workspace-preset-control">
          <button ref={presetQuickTriggerRef} type="button" className="workspace-quick-trigger workspace-preset-quick-trigger" onClick={onTogglePresetMenu} aria-expanded={quickOpen === 'preset'} aria-controls="preset-quick-menu" aria-label={`Preset: ${activePreset?.name ?? 'Live search'}`} disabled={quickMenuBusy}>
            <Bookmark size={13} aria-hidden="true" />
            <span className="workspace-context-label">Preset</span>
            <strong title={activePreset?.name}>{activePreset?.name ?? 'Live search'}</strong>
            <ChevronDown size={13} aria-hidden="true" />
          </button>
          {quickOpen === 'preset' && (
            <div className="workspace-quick-popover preset-quick-popover" id="preset-quick-menu" role="menu" aria-label="Recent presets">
              <span className="workspace-quick-heading">Recent Presets</span>
              {quickPresets.length > 0 ? (
                <div className="workspace-quick-list">
                  {quickPresets.map((preset) => {
                    const presetActive = preset.id === activePresetId;
                    const presetPending = preset.id === quickApplyingPresetId;
                    return (
                      <button type="button" className={`workspace-quick-item ${presetActive ? 'is-active' : ''}`} key={preset.id} onClick={() => onSelectPreset(preset.id)} role="menuitemradio" aria-checked={presetActive} aria-busy={presetPending} disabled={quickMenuBusy}>
                        {presetPending ? <Loader size={14} className="spinning" aria-hidden="true" /> : <Bookmark size={14} aria-hidden="true" />}
                        <span><strong title={preset.name}>{preset.name}</strong><small>{describePreset(preset)}</small></span>
                        {presetActive && <Check size={14} aria-label="Active" />}
                      </button>
                    );
                  })}
                </div>
              ) : <p className="workspace-quick-empty">No presets saved in this Workspace.</p>}
              <button type="button" className="workspace-quick-manager-link" onClick={onOpenPresetLibrary} disabled={quickMenuBusy}><Bookmark size={13} /> Open preset library</button>
            </div>
          )}
        </div>
        {activePresetDirty && (
          <button type="button" className="preset-update-button workspace-update-button" onClick={onUpdateActivePreset} disabled={!canUpdateActivePreset || quickBusy} aria-label={`Update preset ${activePreset?.name ?? 'active preset'}`} title={`Update preset ${activePreset?.name ?? 'active preset'} with the current targets`}>
            <Save size={11} />
          </button>
        )}
      </div>
    </div>
  );
}