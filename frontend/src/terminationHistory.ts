import type { PodTerminationHistoryEntry } from './types';

export function terminationEntryTitle(entry: PodTerminationHistoryEntry): string {
  if (entry.source === 'container') {
    return `${entry.container ?? 'Container'} · ${entry.reason ?? entry.state ?? 'State change'}`;
  }
  return entry.reason || 'Pod event';
}

export function terminationEntryDetails(entry: PodTerminationHistoryEntry): string[] {
  const details: string[] = [];
  if (entry.source === 'container' && entry.state) details.push(entry.state);
  if (entry.source === 'event' && entry.type) details.push(entry.type);
  if (entry.exitCode !== undefined) details.push(`exit code ${entry.exitCode}`);
  if (entry.signal !== undefined) details.push(`signal ${entry.signal}`);
  if (entry.count !== undefined && entry.count > 1) details.push(`${entry.count} occurrences`);
  return details;
}