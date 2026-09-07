import { useCallback, useEffect, useState } from 'react';

export type RuntimeHealth = {
  status: 'ok' | 'degraded';
  checks: {
    database: 'ok' | 'unavailable';
    aiProvider: 'configured' | 'unavailable';
    configuredProviderCount: number;
  };
  timestamp: string;
};

export function useRuntimeHealth() {
  const [data, setData] = useState<RuntimeHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/readyz', { cache: 'no-store' });
      const payload = await response.json().catch(() => null) as RuntimeHealth | null;
      if (!payload || (payload.status !== 'ok' && payload.status !== 'degraded')) {
        throw new Error('READINESS_RESPONSE_INVALID');
      }
      setData(payload);
      setError(null);
    } catch {
      setError('RUNTIME_HEALTH_UNAVAILABLE');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (navigator.onLine) void refresh();
    }, 30_000);
    const onOnline = () => void refresh();
    window.addEventListener('online', onOnline);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [refresh]);

  return { data, error, loading, refresh };
}
