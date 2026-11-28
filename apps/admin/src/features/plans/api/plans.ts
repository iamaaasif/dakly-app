import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AdminPlan,
  AdminPlansResponse,
  CreatePlanInput,
  RetirePlanInput,
  UpdatePlanInput,
} from '@dakly/contracts/admin-plans';

import { adminApi, adminPut } from '@/lib/api-client';

const planKeys = { all: ['admin-plans'] as const };

export const usePlans = () =>
  useQuery({ queryKey: planKeys.all, queryFn: () => adminApi<AdminPlansResponse>('plans') });

export function useUpdatePlan(code: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: UpdatePlanInput) => adminPut<AdminPlan>(`plans/${code}`, change),
    onSuccess: () => client.invalidateQueries({ queryKey: planKeys.all }),
  });
}

export function useCreatePlan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (plan: CreatePlanInput) => adminApi<AdminPlan>('plans', plan),
    onSuccess: () => client.invalidateQueries({ queryKey: planKeys.all }),
  });
}

export function useRetirePlan(code: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: RetirePlanInput) => adminApi<AdminPlan>(`plans/${code}/retire`, change),
    onSuccess: () => client.invalidateQueries({ queryKey: planKeys.all }),
  });
}
