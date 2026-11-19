'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
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
  const [previewError, setPreviewError] = useState(false);
  const form = useForm<SettingsInput, undefined, SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { name: workflow.name, graph: workflow.graph },
  });

  async function confirm(draft: SettingsValues) {
    const current = await refresh();
    if (current.isError || !current.data) return setPreviewError(true);
    setPreviewError(false);
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
        className="min-h-screen bg-surface-muted"
        onSubmit={form.handleSubmit((draft) => submit(draft, false))}
      >
        <SettingsHeader
          workflow={workflow}
          pending={save.isPending || form.formState.isSubmitting}
          onPublish={form.handleSubmit(confirm)}
        />
        <SettingsFields
          previewError={previewError}
          error={confirmation ? undefined : save.error?.message}
          pending={save.isPending}
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

function SettingsFields({
  previewError,
  error,
  pending,
}: {
  previewError: boolean;
  error?: string;
  pending: boolean;
}) {
  const { register, formState } = useFormContext<SettingsInput>();
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <FormField name="name" label="Workflow name">
        {(field) => <Input {...field} {...register('name')} maxLength={80} />}
      </FormField>
      {previewError && (
        <p role="alert" className="text-danger">
          Could not check who is in this workflow. Try again.
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {formState.errors.graph && (
        <p role="alert" className="text-danger">
          Check the workflow settings before saving.
        </p>
      )}
      <fieldset className="space-y-4" disabled={pending}>
        <WorkflowEntrySettings />
        <WorkflowStepSettings />
      </fieldset>
    </div>
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
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/automations"
          aria-label="Back to Automations"
          className="grid size-10 shrink-0 place-items-center rounded-md border border-input-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <h1 className="font-bold break-words">{workflow.name}</h1>
          <p className="text-sm text-text-muted">
            {statusLabels[workflow.status]} · When {triggerLabels[workflow.graph.trigger.key]}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" type="submit" disabled={pending}>
          Save draft
        </Button>
        <Button type="button" disabled={pending} onClick={onPublish}>
          Publish
        </Button>
      </div>
    </header>
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
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={onPublish} loading={pending}>
          Publish workflow
        </Button>
      </div>
    </SessionDialog>
  );
}
