import { useEffect, useRef, useState } from 'react';
import { AppWindow, Check, ChevronDown, Layers, ListFilter, RefreshCw, Rows3, Search, Server, X } from 'lucide-react';
import { REFRESH_INTERVALS } from '../store';
import type { GroupingMode } from '../types';

const GROUPING_OPTIONS: { mode: GroupingMode; label: string; icon: React.ReactNode; hint: string }[] = [
  {
    mode: 'namespace',
    label: 'Namespace',
    icon: <Layers size={13} />,
    hint: 'Group by namespace, comparing clusters side by side',
  },
  {
    mode: 'cluster',
    label: 'Cluster',
    icon: <Server size={13} />,
    hint: 'Group by cluster',
  },
  {
    mode: 'application',
    label: 'Application',
    icon: <AppWindow size={13} />,
    hint: 'Group by normalized application identity',
  },
  { mode: 'flat', label: 'Flat', icon: <Rows3 size={13} />, hint: 'Single list, no grouping' },
];

interface ViewToolbarProps {
  grouping: GroupingMode;
  onGroupingChange: (grouping: GroupingMode) => void;
  filter: string;
  onFilterChange: (filter: string) => void;
  applications: ApplicationFilterOption[];
  selectedApplications: string[];
  onSelectedApplicationsChange: (keys: string[]) => void;
  visibleCount: number;
  totalCount: number;
  onRefresh: () => void;
  loading: boolean;
  /** True during a silent auto-refresh (table stays visible). */
  refreshing: boolean;
  refreshSeconds: number;
  onRefreshSecondsChange: (seconds: number) => void;
  lastUpdatedAt?: number;
}

export interface ApplicationFilterOption {
  key: string;
  name: string;
  podCount: number;
}

/** Grouping switch, text filter and refresh controls for the unified view. */
export function ViewToolbar({
  grouping,
  onGroupingChange,
  filter,
  onFilterChange,
  applications,
  selectedApplications,
  onSelectedApplicationsChange,
  visibleCount,
  totalCount,
  onRefresh,
  loading,
  refreshing,
  refreshSeconds,
  onRefreshSecondsChange,
  lastUpdatedAt,
}: ViewToolbarProps) {
  const filtering = filter.trim().length > 0 || selectedApplications.length > 0;
  const [applicationMenuOpen, setApplicationMenuOpen] = useState(false);
  const [applicationQuery, setApplicationQuery] = useState('');
  const applicationFilterRef = useRef<HTMLDivElement>(null);
  const selectedApplicationKeys = new Set(selectedApplications);
  const visibleApplications = applications.filter((application) => {
    const needle = applicationQuery.trim().toLowerCase();
    return !needle || `${application.name} ${application.key}`.toLowerCase().includes(needle);
  });

  useEffect(() => {
    if (!applicationMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!applicationFilterRef.current?.contains(event.target as Node)) setApplicationMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setApplicationMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [applicationMenuOpen]);

  const toggleApplication = (key: string) => {
    onSelectedApplicationsChange(
      selectedApplicationKeys.has(key)
        ? selectedApplications.filter((selectedKey) => selectedKey !== key)
        : [...selectedApplications, key],
    );
  };
  // The "last updated" label is relative, so it needs its own tick to stay honest.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!lastUpdatedAt) return;
    const timer = setInterval(() => forceTick((n) => n + 1), 10_000);
    return () => clearInterval(timer);
  }, [lastUpdatedAt]);

  return (
    <div className="view-toolbar">
      <div className="grouping-control" role="group" aria-label="View grouping">
        <span className="toolbar-label">Group by</span>
        {GROUPING_OPTIONS.map((option) => (
          <button
            type="button"
            key={option.mode}
            className={grouping === option.mode ? 'active' : ''}
            onClick={() => onGroupingChange(option.mode)}
            aria-pressed={grouping === option.mode}
            title={option.hint}
          >
            {option.icon} {option.label}
          </button>
        ))}
      </div>

      <div className={`application-filter ${selectedApplications.length > 0 ? 'is-active' : ''}`} ref={applicationFilterRef}>
        <button
          type="button"
          className="application-filter-trigger"
          onClick={() => setApplicationMenuOpen((open) => !open)}
          aria-expanded={applicationMenuOpen}
          aria-controls="application-filter-menu"
          aria-haspopup="menu"
          title="Filter by application"
        >
          <ListFilter size={13} />
          <span>Apps</span>
          <strong>{selectedApplications.length > 0 ? selectedApplications.length : 'All'}</strong>
          <ChevronDown size={12} />
        </button>
        {applicationMenuOpen && (
          <div className="application-filter-popover" id="application-filter-menu" role="menu" aria-label="Filter by application">
            <div className="application-filter-heading">
              <span>Applications</span>
              <strong>{selectedApplications.length > 0 ? `${selectedApplications.length} selected` : 'All selected'}</strong>
            </div>
            <label className="application-filter-search">
              <Search size={12} />
              <span className="visually-hidden">Search applications</span>
              <input
                value={applicationQuery}
                onChange={(event) => setApplicationQuery(event.target.value)}
                placeholder="Search applications..."
                aria-label="Search applications"
              />
              {applicationQuery && (
                <button type="button" className="filter-clear" onClick={() => setApplicationQuery('')} aria-label="Clear application search">
                  <X size={11} />
                </button>
              )}
            </label>
            <div className="application-filter-list">
              {visibleApplications.map((application) => (
                <label className="application-filter-option" key={application.key}>
                  <input
                    type="checkbox"
                    checked={selectedApplicationKeys.has(application.key)}
                    onChange={() => toggleApplication(application.key)}
                  />
                  <span>
                    <strong>{application.name}</strong>
                    <small>{application.podCount} pods</small>
                  </span>
                  {selectedApplicationKeys.has(application.key) && <Check size={13} />}
                </label>
              ))}
              {visibleApplications.length === 0 && <p className="application-filter-empty">No application matches.</p>}
            </div>
            {selectedApplications.length > 0 && (
              <button type="button" className="text-button application-filter-clear" onClick={() => onSelectedApplicationsChange([])}>
                Clear application filter
              </button>
            )}
          </div>
        )}
      </div>

      <label className="filter-bar">
        <Search size={14} />
        <span className="visually-hidden">Filter pods</span>
        <input
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Filter by pod, status, node, container..."
          aria-label="Filter pods"
        />
        {filtering && (
          <button
            type="button"
            className="filter-clear"
            onClick={() => onFilterChange('')}
            title="Clear filter"
            aria-label="Clear filter"
          >
            <X size={12} />
          </button>
        )}
      </label>

      <div className="toolbar-meta">
        <span aria-live="polite">
          {filtering ? `${visibleCount} of ${totalCount}` : `${totalCount}`} pods
        </span>

        <label className="refresh-control">
          <span className="visually-hidden">Auto-refresh</span>
          <select
            value={refreshSeconds}
            onChange={(e) => onRefreshSecondsChange(Number(e.target.value))}
            aria-label="Auto-refresh interval"
            title="Auto-refresh"
          >
            {REFRESH_INTERVALS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds === 0 ? 'manual' : `${seconds}s`}
              </option>
            ))}
          </select>
        </label>

        {lastUpdatedAt && <span className="last-updated">{formatRelative(lastUpdatedAt)}</span>}

        <button
          type="button"
          className="icon-button subtle"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh now"
          aria-label="Refresh pods"
        >
          <RefreshCw size={14} className={loading || refreshing ? 'spinning' : ''} />
        </button>
      </div>
    </div>
  );
}

/** "just now", "12s ago", "3min ago" — keeps the freshness of the data visible. */
function formatRelative(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}min ago`;
  return `${Math.round(minutes / 60)}h ago`;
}
