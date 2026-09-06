import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useSpecialistsStatus() {
  return useQuery({
    queryKey: ['specialists-status'],
    queryFn: async () => {
      const res = await fetch('/api/specialists/status');
      if (!res.ok) throw new Error('Failed to fetch status');
      return res.json();
    },
  });
}

export function useFinanceSummary() {
  return useQuery({
    queryKey: ['finance-summary'],
    queryFn: async () => {
      const res = await fetch('/api/finance/summary');
      if (!res.ok) throw new Error('Failed to fetch finance summary');
      return res.json();
    },
  });
}

export function useMarketsIntelligenceStatus() {
  return useQuery({
    queryKey: ['markets-intelligence-status'],
    queryFn: async () => {
      const res = await fetch('/api/markets/intelligence/status', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch markets intelligence status');
      return res.json();
    },
  });
}

export function useSpecialistRecords(specialist: string, type: string) {
  return useQuery({
    queryKey: ['records', specialist, type],
    queryFn: async () => {
      const res = await fetch(`/api/specialists/${specialist}/records?type=${type}`);
      if (!res.ok) throw new Error('Failed to fetch records');
      return res.json() as Promise<any[]>;
    },
  });
}

export function useCreateSpecialistRecord(specialist: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/specialists/${specialist}/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create record');
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['records', specialist, variables.recordType] });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
      queryClient.invalidateQueries({ queryKey: ['specialists-status'] });
    },
  });
}

export function useDeleteSpecialistRecord(specialist: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, type }: { id: string, type: string }) => {
      const res = await fetch(`/api/specialists/${specialist}/records/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete record');
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['records', specialist, variables.type] });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
      queryClient.invalidateQueries({ queryKey: ['specialists-status'] });
    },
  });
}

export function useCreateActionPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/action-plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create plan');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', 'general', 'ACTION_PLAN'] });
      queryClient.invalidateQueries({ queryKey: ['specialists-status'] });
    },
  });
}

export function useAuthorizeActionPlanStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ planRecordId, stepId, data }: { planRecordId: string, stepId: string, data: any }) => {
      const res = await fetch(`/api/action-plans/${planRecordId}/steps/${stepId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to authorize step');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', 'general', 'ACTION_PLAN'] });
      queryClient.invalidateQueries({ queryKey: ['specialists-status'] });
    },
  });
}

export function useEconomicEngineStatus() {
  return useQuery({
    queryKey: ['economic-engine-status'],
    queryFn: async () => {
      const res = await fetch('/api/economic-engine/status');
      if (!res.ok) throw new Error('Failed to fetch status');
      return res.json();
    },
  });
}

export function useEconomicsEntries() {
  return useQuery({
    queryKey: ['economics-entries'],
    queryFn: async () => {
      const res = await fetch('/api/economic-engine/economics');
      if (!res.ok) throw new Error('Failed to fetch entries');
      return res.json() as Promise<any[]>;
    },
  });
}

export function useCreateEconomicsEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/economic-engine/economics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create entry');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['economics-entries'] });
      queryClient.invalidateQueries({ queryKey: ['economics-summary'] });
    },
  });
}

export function useDeleteEconomicsEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/economic-engine/economics/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete entry');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['economics-entries'] });
      queryClient.invalidateQueries({ queryKey: ['economics-summary'] });
    },
  });
}

export function useEconomicsSummary() {
  return useQuery({
    queryKey: ['economics-summary'],
    queryFn: async () => {
      const res = await fetch('/api/economic-engine/economics/summary');
      if (!res.ok) throw new Error('Failed to fetch summary');
      return res.json();
    },
  });
}

export function useCommerceStatus() {
  return useQuery({
    queryKey: ['commerce-status'],
    queryFn: async () => {
      const res = await fetch('/api/economic-engine/commerce/status');
      if (!res.ok) throw new Error('Failed to fetch status');
      return res.json();
    },
  });
}

export function useEvaluateUnitEconomics() {
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/economic-engine/commerce/unit-economics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to evaluate unit economics');
      return res.json();
    },
  });
}

export function useMarketsLabStatus() {
  return useQuery({
    queryKey: ['markets-lab-status'],
    queryFn: async () => {
      const res = await fetch('/api/economic-engine/market-lab/status');
      if (!res.ok) throw new Error('Failed to fetch status');
      return res.json();
    },
  });
}

export function usePaperPortfolio() {
  return useQuery({
    queryKey: ['markets-paper-portfolio'],
    queryFn: async () => {
      const res = await fetch('/api/economic-engine/paper/portfolio');
      if (!res.ok) throw new Error('Failed to fetch portfolio');
      return res.json();
    },
  });
}

export function useUpdatePaperPortfolio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/economic-engine/paper/portfolio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update portfolio');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['markets-paper-portfolio'] });
    },
  });
}

export function useMarketsStrategies() {
  return useQuery({
    queryKey: ['markets-strategies'],
    queryFn: async () => {
      const res = await fetch('/api/economic-engine/paper/strategies');
      if (!res.ok) throw new Error('Failed to fetch strategies');
      return res.json() as Promise<any[]>;
    },
  });
}

export function useStrategyLeaderboard() {
  return useQuery({
    queryKey: ['markets-strategy-leaderboard'],
    queryFn: async () => {
      const res = await fetch('/api/economic-engine/paper/strategies/leaderboard');
      if (!res.ok) throw new Error('Failed to fetch leaderboard');
      return res.json() as Promise<any>;
    },
  });
}

export function useTradingReview() {
  return useQuery({
    queryKey: ['markets-trading-review'],
    queryFn: async () => {
      const res = await fetch('/api/economic-engine/paper/review');
      if (!res.ok) throw new Error('Failed to fetch trading review');
      return res.json() as Promise<any>;
    },
  });
}

export function useLiveReadiness() {
  return useQuery({
    queryKey: ['markets-live-readiness'],
    queryFn: async () => {
      const res = await fetch('/api/economic-engine/paper/strategies/live-readiness');
      if (!res.ok) throw new Error('Failed to fetch live readiness');
      return res.json();
    },
  });
}

export function useRunAutonomousCycle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/economic-engine/paper/autonomous-cycle`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to run cycle');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['markets-lab-status'] });
      queryClient.invalidateQueries({ queryKey: ['markets-strategies'] });
      queryClient.invalidateQueries({ queryKey: ['markets-strategy-leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['markets-trading-review'] });
      queryClient.invalidateQueries({ queryKey: ['markets-live-readiness'] });
    },
  });
}
