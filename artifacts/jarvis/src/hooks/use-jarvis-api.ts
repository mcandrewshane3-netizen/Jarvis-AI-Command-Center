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
