'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { staffEnrollmentSchema, type StaffEnrollmentInput } from '@dakly/contracts/staff-auth';
import { Button } from '@dakly/ui/button';
import { EnrollmentFields } from './enrollment-fields';
import { useStaffEnrollment } from '../api/enroll';
import { AuthPanel } from './auth-panel';
import { FactorChallenge } from './factor-challenge';
export function EnrollmentScreen() {
  const enroll = useStaffEnrollment();
  const form = useForm<StaffEnrollmentInput>({
    resolver: zodResolver(staffEnrollmentSchema),
    defaultValues: { proof: '', password: '', factor: 'passkey' },
  });
  return (
    <AuthPanel
      title="Set up your staff account"
      description="Use the private setup proof supplied by your operator. Your Access identity must match the provisioned account."
    >
      {enroll.data ? (
        <FactorChallenge enrollment={enroll.data} />
      ) : (
        <form
          method="post"
          className="space-y-4"
          onSubmit={form.handleSubmit((input) => enroll.mutate(input))}
        >
          <EnrollmentFields form={form} />
          {enroll.error ? (
            <p role="alert" className="text-danger">
              {enroll.error.message}
            </p>
          ) : null}
          <Button type="submit" className="w-full" loading={enroll.isPending}>
            Set password and verify
          </Button>
        </form>
      )}
    </AuthPanel>
  );
}
