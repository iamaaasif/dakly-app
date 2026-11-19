'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';

import type { AutomationDetailResponse } from '@dakly/contracts/automations';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { QueryError } from '@dakly/ui/query-error';

import { useAutomation, useSaveAutomation } from '../api/automation-settings';
import { statusLabels, triggerLabels } from '../automation-labels';
import { settingsSchema, type SettingsInput, type SettingsValues } from '../workflow-settings-form';
import { WorkflowEntrySettings } from './workflow-entry-settings';
import { WorkflowPageHeader } from './workflow-page-header';
import { WorkflowStepSettings } from './workflow-step-settings';
import { SessionDialog } from '@/components/session-dialog';

export function WorkflowSettings({ id }: { id: string }) {
  const workflow = useAutomation(id);
  if (workflow.isError && !workflow.data)
    return (
      <QueryError message="Could not load this workflow." onRetry={() => void workflow.refetch()} />
    );
  if (!workflow.data)
    return (
      <p role="status" className="p-4">
        Loading workflow…
      </p>
    );
  return <SettingsForm key={id} workflow={workflow.data} refresh={workflow.refetch} />;
}

type SettingsFormProps = {
  workflow: AutomationDetailResponse;
  refresh: () => Promise<{ data?: AutomationDetailResponse; isError: boolean }>;
};

function SettingsForm({ workflow, refresh }: SettingsFormProps) {
  const router = useRouter();
  const save = useSaveAutomation(workflow.id);
  const [confirmation, setConfirmation] = useState<{ draft: SettingsValues; count: number }>();
  const form = useForm<SettingsInput, undefined, SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { name: workflow.name, graph: workflow.graph },
  });

  async function confirm(draft: SettingsValues) {
    const current = await refresh();
    if (current.isError || !current.data) {
      form.setError('root', { message: 'Could not check who is in this workflow. Try again.' });
      return;
    }
    setConfirmation({ draft, count: current.data.activeRuns });
  }

  function submit(draft: SettingsValues, publish: boolean) {
    save.mutate(
      { draft, publish },
      {
        onSuccess: () => (publish ? router.push('/automations?tab=active') : form.reset(draft)),
      },
    );
  }
  return (
    <FormProvider {...form}>
      <form
        method="post"
        className="min-h-screen bg-surface-muted"
        onSubmit={form.handleSubmit((draft) => submit(draft, false))}
      >
        <SettingsHeader
          workflow={workflow}
          pending={save.isPending || form.formState.isSubmitting}
          onPublish={form.handleSubmit(confirm)}
        />
        <SettingsFields
          pending={save.isPending || form.formState.isSubmitting}
          error={confirmation ? undefined : save.error?.message}
        />
      </form>
      {confirmation && (
        <PublishDialog
          count={confirmation.count}
          pending={save.isPending}
          error={save.error?.message}
          onClose={() => {
            save.reset();
            setConfirmation(undefined);
          }}
          onPublish={() => submit(confirmation.draft, true)}
        />
      )}
    </FormProvider>
  );
}

function SettingsFields({ error, pending }: { error?: string; pending: boolean }) {
  const { register, formState } = useFormContext<SettingsInput>();
  return (
    <fieldset disabled={pending} className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
      <FormField name="name" label="Workflow name">
        {(field) => <Input {...field} {...register('name')} maxLength={80} />}
      </FormField>
      {(error || formState.errors.root?.message) && (
        <p role="alert" className="text-danger">
          {error ?? formState.errors.root?.message}
        </p>
      )}
      {formState.errors.graph && (
        <p role="alert" className="text-danger">
          Check the workflow settings before saving.
        </p>
      )}
      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <WorkflowEntrySettings />
        <WorkflowStepSettings />
      </div>
    </fieldset>
  );
}

function SettingsHeader({
  workflow,
  pending,
  onPublish,
}: {
  workflow: AutomationDetailResponse;
  pending: boolean;
  onPublish: () => void;
}) {
  const subtitle = `${statusLabels[workflow.status]} · When ${triggerLabels[workflow.graph.trigger.key]}`;
  return (
    <WorkflowPageHeader title={workflow.name} subtitle={subtitle}>
      <Button variant="secondary" type="submit" disabled={pending}>
        Save draft
      </Button>
      <Button loading={pending} onClick={onPublish}>
        {workflow.status === 'draft' ? 'Start workflow' : 'Publish changes'}
      </Button>
    </WorkflowPageHeader>
  );
}

function PublishDialog({
  count,
  error,
  pending,
  onClose,
  onPublish,
}: {
  count: number;
  error?: string;
  pending: boolean;
  onClose: () => void;
  onPublish: () => void;
}) {
  return (
    <SessionDialog open title="Publish workflow?" onClose={onClose} closeDisabled={pending}>
      <p>{count === 1 ? '1 person is' : `${count} people are`} in this workflow now.</p>
      <p className="mt-2 text-sm text-text-muted">
        People already in the workflow continue on the version they entered.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-danger">
          {error}
        </p>
      )}
      <Button className="mt-4" onClick={onPublish} loading={pending}>
        Publish workflow
      </Button>
    </SessionDialog>
  );
}
