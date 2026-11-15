import { useMutation } from '@tanstack/react-query';

import type {
  StaffRecoveryLookup,
  StaffRecoveryTarget,
  StaffRecoveryRequest,
  StaffRecoveryPreview,
  StaffRecoveryCode,
  StaffRecoveryConfirmation,
} from '@dakly/contracts/staff-recovery';

import { adminApi } from '@/lib/api-client';

export function useRecoveryPreview() {
  return useMutation({
    mutationFn: (input: StaffRecoveryRequest) =>
      adminApi<StaffRecoveryPreview>('account-recovery/preview', input),
  });
}
export function useRecoveryCode() {
  return useMutation({
    mutationFn: (input: StaffRecoveryCode) => adminApi('account-recovery/code', input),
  });
}
export function useRecoverAccount() {
  return useMutation({
    mutationFn: (input: StaffRecoveryConfirmation) =>
      adminApi<{ id: string }>('account-recovery', input),
  });
}

export function useRecoveryLookup() {
  return useMutation({
    mutationFn: (input: StaffRecoveryLookup) =>
      adminApi<StaffRecoveryTarget>('account-recovery/lookup', input),
  });
}
