import { useState } from 'react';
import { Boxes, ChevronDown } from 'lucide-react';
import { formatAge, groupPods, isDegraded, statusSeverity, type PodGroup } from '../podPresentation';
import type { GroupingMode, NormalizedPod } from '../types';

/**
 * Rows rendered per group before requiring an explicit expand. Large namespaces
 * (namespace-system can hold thousands of pods) would otherwise put tens of thousands
 * of nodes in the DOM and stall the browser.
 */
const ROWS_PER_PAGE = 100;

interface PodTableProps {
  pods: NormalizedPod[];
  grouping: GroupingMode;
  /** Key of the pod currently open in the details panel. */
  selectedPod?: string;
  onSelectPod: (pod: NormalizedPod) => void;
}

/** Stable identity for a pod row across clusters and namespaces. */
export function podRowKey(pod: { cluster: string; namespace: string; name: string }): string {
  return `${pod.cluster}/${pod.namespace}/${pod.name}`;
}

/**
 * The unified pods table. Every row carries both Cluster and Namespace, so the
 * same data reads correctly whether it is grouped by namespace, by cluster, or
 * shown flat.
 */
export function PodTable({ pods, grouping, selectedPod, onSelectPod }: PodTableProps) {
  const groups = groupPods(pods, grouping);
  // In grouped modes the grouping dimension is shown in the group header, so the
  // redundant column is dropped from the rows.
  const showCluster = grouping !== 'cluster';
  const showNamespace = grouping !== 'namespace';

  return (
    <div className="pod-table-wrap">
      {groups.map((group) => (
        <PodGroupTable
          key={group.key || 'flat'}
          group={group}
          grouping={grouping}
          showCluster={showCluster}
          showNamespace={showNamespace}
          selectedPod={selectedPod}
          onSelectPod={onSelectPod}
        />
      ))}
    </div>
  );
}

function PodGroupTable({
  group,
  grouping,
  showCluster,
  showNamespace,
  selectedPod,
  onSelectPod,
}: {
  group: PodGroup;
  grouping: GroupingMode;
  showCluster: boolean;
  showNamespace: boolean;
  selectedPod?: string;
  onSelectPod: (pod: NormalizedPod) => void;
}) {
  const [limit, setLimit] = useState(ROWS_PER_PAGE);
  const visible = group.pods.slice(0, limit);
  const hidden = group.pods.length - visible.length;
  const columnCount = 6 + (showCluster ? 1 : 0) + (showNamespace ? 1 : 0);

  return (
    <section className="pod-group">
      {group.key && (
        <header className="pod-group-heading">
          <span className="pod-group-icon">
            <Boxes size={14} />
          </span>
          <strong>{group.label ?? group.key}</strong>
          <span className="pod-group-count">
            {group.pods.length} {group.pods.length === 1 ? 'pod' : 'pods'}
          </span>
          {grouping === 'namespace' && (
            <span className="pod-group-meta">
              {new Set(group.pods.map((p) => p.cluster)).size} cluster(s)
            </span>
          )}
          {grouping === 'application' && (
            <span className="pod-group-meta">
              {new Set(group.pods.map((p) => p.cluster)).size} cluster(s) · {group.key}
            </span>
          )}
        </header>
      )}

      <table className="pod-table">
        <caption className="visually-hidden">
          {group.key ? `Pods in ${group.key}` : 'Pods from all targets'}
        </caption>
        <thead>
          <tr>
            {showCluster && <th scope="col">Cluster</th>}
            {showNamespace && <th scope="col">Namespace</th>}
            <th scope="col">Pod</th>
            <th scope="col">Status</th>
            <th scope="col">Ready</th>
            <th scope="col" className="numeric">
              Restarts
            </th>
            <th scope="col" className="numeric">
              Age
            </th>
            <th scope="col">Node</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((pod) => (
            <tr
              key={podRowKey(pod)}
              className={`pod-row ${selectedPod === podRowKey(pod) ? 'is-selected' : ''}`}
              onClick={() => onSelectPod(pod)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectPod(pod);
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`Ver detalhes de ${pod.name}`}
            >
              {showCluster && <td className="mono-cell">{pod.cluster}</td>}
              {showNamespace && <td className="mono-cell">{pod.namespace}</td>}
              <td className="pod-name-cell" title={pod.name}>
                {pod.name}
              </td>
              <td>
                <span className={`status-badge severity-${statusSeverity(pod.status)}`}>
                  {pod.status}
                </span>
              </td>
              <td className={`mono-cell ${isDegraded(pod) ? 'ready-degraded' : ''}`}>
                {pod.ready}
              </td>
              <td className={`mono-cell numeric ${pod.restarts > 0 ? 'restarts-warn' : ''}`}>
                {pod.restarts}
              </td>
              <td className="mono-cell numeric">{formatAge(pod.ageSeconds)}</td>
              <td className="mono-cell node-cell" title={pod.node}>
                {pod.node || '—'}
              </td>
            </tr>
          ))}
        </tbody>
        {hidden > 0 && (
          <tfoot>
            <tr>
              <td colSpan={columnCount} className="pod-group-more">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setLimit((current) => current + ROWS_PER_PAGE)}
                >
                  <ChevronDown size={14} /> Show {Math.min(hidden, ROWS_PER_PAGE)} more of {hidden}{' '}
                  remaining
                </button>
                <button type="button" className="text-button" onClick={() => setLimit(group.pods.length)}>
                  Show all
                </button>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  );
}
