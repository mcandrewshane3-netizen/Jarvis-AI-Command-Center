import { useCallback, useEffect, useState } from 'react';

export type IntelligenceMode = 'NORMAL' | 'SMART' | 'MAX';
export type ProviderMode = 'AUTO' | 'OPENAI_ONLY' | 'GROK_ONLY' | 'MULTI_AI';

export type AIProvider = {
  id: string;
  name: string;
  configured: boolean;
  available: boolean;
  health: 'AVAILABLE' | 'DEGRADED' | 'NOT_CONFIGURED' | 'UNAVAILABLE';
  reason?: string | null;
  capabilities?: string[];
};

export type AIStatus = {
  intelligenceMode: IntelligenceMode;
  providerMode: ProviderMode;
  providers: AIProvider[];
  updatedAt: string;
};

function message(value: unknown) {
  if (value && typeof value === 'object' && 'error' in value && typeof value.error === 'string') return value.error.replaceAll('_', ' ');
  return 'INTELLIGENCE STATUS UNAVAILABLE';
}

export function useAIStatus() {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/ai/status', { cache: 'no-store', credentials: 'include' });
      const payload = await response.json();
      if (!response.ok) throw payload;
      setStatus(payload);
    } catch (caught) {
      setStatus(null);
      setError(message(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const update = useCallback(async (patch: Partial<Pick<AIStatus, 'intelligenceMode' | 'providerMode'>>) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const payload = await response.json();
      if (!response.ok) throw payload;
      setStatus((current) => current ? { ...current, ...payload } : current);
      await refresh();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSaving(false);
    }
  }, [refresh]);

  return { status, loading, saving, error, refresh, update };
}