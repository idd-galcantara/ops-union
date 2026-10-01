import { useEffect } from 'react';

interface AutoRefreshOptions {
  refreshSeconds: number;
  targetCount: number;
  refresh: (options: { silent: true }) => unknown;
}

export function useAutoRefresh({ refreshSeconds, targetCount, refresh }: AutoRefreshOptions): void {
  useEffect(() => {
    if (refreshSeconds <= 0 || targetCount === 0) return;
    const timer = setInterval(() => {
      void refresh({ silent: true });
    }, refreshSeconds * 1000);
    return () => clearInterval(timer);
  }, [refresh, refreshSeconds, targetCount]);
}