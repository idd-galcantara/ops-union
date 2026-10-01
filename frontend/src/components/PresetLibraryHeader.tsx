import { Bookmark, RefreshCw, X } from 'lucide-react';
import type { Preset } from '../presets';

export function PresetLibraryHeader({
  presets,
  activePresetId,
  activePresetDirty,
  applyingPresetId,
  busy,
  onClose,
}: {
  presets: Preset[];
  activePresetId: string | null;
  activePresetDirty: boolean;
  applyingPresetId: string | null;
  busy: boolean;
  onClose: () => void;
}) {
  const activePresetName = presets.find((preset) => preset.id === activePresetId)?.name ?? 'unknown';
  const applyingPresetName = presets.find((preset) => preset.id === applyingPresetId)?.name ?? 'selected preset';
  return (
    <>
      <div className="preset-library-header">
        <div><span className="eyebrow">Saved target combinations</span><h2 id="preset-library-title">Presets <b>{presets.length}</b></h2></div>
        <button type="button" className="icon-button subtle" onClick={onClose} aria-label="Close presets" disabled={busy}><X size={15} /></button>
      </div>
      {activePresetId && <div className={`preset-library-status ${activePresetDirty ? 'is-dirty' : ''}`}><Bookmark size={13} /><span>Active preset: <strong>{activePresetName}</strong></span>{activePresetDirty && <em>edited</em>}</div>}
      {applyingPresetId && <div className="preset-library-status is-pending" aria-live="polite"><RefreshCw size={13} className="spinning" /><span>Loading pods for <strong>{applyingPresetName}</strong>...</span></div>}
    </>
  );
}