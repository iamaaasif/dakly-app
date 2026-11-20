'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import type { AutomationDetailResponse } from '@dakly/contracts/automations';
import { type AutomationGraph, automationGraphSchema } from '@dakly/contracts/automations/graph';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';

import { usePublishAutomation, useSaveAutomation } from '../api/automation-settings';
import { useAutomation } from '../api/automations';
import { statusLabels, triggerLabels } from '../automation-labels';
import type { SettingsInput } from '../workflow-settings-form';
import { WorkflowEntrySettings } from './workflow-entry-settings';
import { WorkflowPageHeader } from './workflow-page-header';
import { WorkflowPublishDialog } from './workflow-publish-dialog';
import { WorkflowStepSettings } from './workflow-step-settings';

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

type SettingsProps = {
  workflow: AutomationDetailResponse;
  refresh: ReturnType<typeof useAutomation>['refetch'];
};

function useEditor({ workflow, refresh }: SettingsProps) {
  const router = useRouter();
  const save = useSaveAutomation(workflow.id);
  const publish = usePublishAutomation(workflow.id);
  const [count, setCount] = useState<number>();
  const form = useForm<SettingsInput, undefined, AutomationGraph>({
    resolver: zodResolver(automationGraphSchema),
    defaultValues: workflow.graph,
  });
  const { errors, isDirty, isSubmitting } = form.formState;
  const pending = isSubmitting || save.isPending || publish.isPending;

  async function saveGraph(graph: AutomationGraph) {
    try {
      await save.mutateAsync(graph);
      form.reset(graph);
      return true;
    } catch {
      return false;
    }
  }

  const confirm = form.handleSubmit(async () => {
    const result = await refresh();
    if (result.isError || !result.data) {
      form.setError('root', { message: 'Could not check who is in this workflow. Try again.' });
      return;
    }
    save.reset();
    publish.reset();
    setCount(result.data.activeRuns);
  });

  const start = form.handleSubmit(async (graph) => {
    if (isDirty && !(await saveGraph(graph))) return;
    publish.mutate(undefined, { onSuccess: () => router.push('/automations?tab=active') });
  });

  const validation =
    errors.root?.message ??
    (Object.keys(errors).length ? 'Check the workflow settings before saving.' : undefined);
  return {
    form,
    pending,
    saving: save.isPending,
    count,
    confirm,
    start,
    save: form.handleSubmit(saveGraph),
    close: () => {
      save.reset();
      publish.reset();
      setCount(undefined);
    },
    error: save.error?.message ?? publish.error?.message ?? validation,
  };
}

function SettingsForm(props: SettingsProps) {
  const { workflow } = props;
  const editor = useEditor(props);
  const { saving } = editor;
  const paused = workflow.status === 'paused';
  const publishLabel = paused ? 'Publish and enable' : 'Publish changes';
  const subtitle = `${statusLabels[workflow.status]} · When ${triggerLabels[workflow.graph.trigger.key]}`;
  return (
    <FormProvider {...editor.form}>
      <form
        method="post"
        noValidate
        className="min-h-screen bg-surface-muted"
        onSubmit={editor.save}
      >
        <WorkflowPageHeader title={workflow.name} subtitle={subtitle} canvasId={workflow.id}>
          <Button variant="secondary" type="submit" loading={saving} disabled={editor.pending}>
            Save draft
          </Button>
          <Button disabled={editor.pending} onClick={editor.confirm}>
            {workflow.status === 'draft' ? 'Start workflow' : publishLabel}
          </Button>
        </WorkflowPageHeader>
        <fieldset disabled={editor.pending} className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
          {editor.count === undefined && editor.error && (
            <p role="alert" className="text-danger">
              {editor.error}
            </p>
          )}
          <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <WorkflowEntrySettings />
            <WorkflowStepSettings />
          </div>
        </fieldset>
      </form>
      {editor.count !== undefined && (
        <WorkflowPublishDialog
          count={editor.count}
          paused={paused}
          error={editor.error}
          pending={editor.pending}
          onClose={editor.close}
          onPublish={editor.start}
        />
      )}
    </FormProvider>
  );
}
