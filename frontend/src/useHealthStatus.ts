import { useEffect, useState } from 'react';

export type HealthState = 'loading' | 'ok' | 'error';

export function useHealthStatus(): HealthState {
  const [health, setHealth] = useState<HealthState>('loading');

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetch('/api/health', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error();
        if (active) setHealth('ok');
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setHealth('error');
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return health;
}