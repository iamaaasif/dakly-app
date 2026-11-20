import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import {
  saveAgentSettingsSchema,
  type AgentSettingsResponse,
  type SaveAgentSettingsInput,
} from '@dakly/contracts/ai-agent-settings';
import { ApiError } from '@dakly/ui/api-client';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';
import { useToast } from '@dakly/ui/toast';

import { useAgentSettings, useSaveAgentSettings } from '../api/agent-settings';
import { AgentSettingsFields } from './agent-settings-fields';
import { formError } from '@/lib/form-error';

// Settings, testers and test questions share one version, so any of them can make a save stale.
const staleMessage =
  'These settings were changed somewhere else since you opened them, so your edits were not saved. Load the latest settings and make your change again.';

function formValues({ handoverRulesSaved: _saved, ...values }: AgentSettingsResponse) {
  return values;
}

export function AgentSettingsTab({ canEdit }: { canEdit: boolean }) {
  const settings = useAgentSettings();
  if (settings.isPending) return <Skeleton className="h-96 w-full" />;
  if (settings.isError)
    return <QueryError message={settings.error.message} onRetry={() => void settings.refetch()} />;
  return (
    <SettingsForm
      saved={settings.data}
      canEdit={canEdit}
      onReload={async () => (await settings.refetch()).data}
    />
  );
}

type SettingsFormProps = {
  saved: AgentSettingsResponse;
  canEdit: boolean;
  onReload: () => Promise<AgentSettingsResponse | undefined>;
};

function SettingsForm({ saved, canEdit, onReload }: SettingsFormProps) {
  const form = useForm<SaveAgentSettingsInput>({
    resolver: zodResolver(saveAgentSettingsSchema),
    defaultValues: formValues(saved),
  });
  // Testers and test questions also bump the version; keep what the user has typed but not saved.
  useEffect(() => {
    const typed = form.getValues();
    const dirtyKeys = Object.keys(form.formState.dirtyFields) as (keyof SaveAgentSettingsInput)[];
    form.reset(formValues(saved), { keepDirtyValues: true });
    // reset with keepDirtyValues keeps the values but clears the dirty flag, which would disable Save.
    for (const key of dirtyKeys) form.setValue(key, typed[key], { shouldDirty: true });
  }, [form, saved]);
  const save = useSaveAgentSettings();
  const showToast = useToast();
  const submit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values);
      showToast('AI agent settings saved.');
    } catch (error) {
      formError(error, form.setError);
      if (error instanceof ApiError && error.code === 'AI_AGENT_SETTINGS_CHANGED')
        form.setError('root', { message: staleMessage });
    }
  });
  return (
    <form onSubmit={submit} aria-label="AI agent settings">
      <AgentSettingsFields form={form} disabled={!canEdit || save.isPending} />
      {form.formState.errors.root ? (
        <p role="alert" className="mt-4 text-danger">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {canEdit ? (
          <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty}>
            Save changes
          </Button>
        ) : (
          <p className="text-text-muted">You can view these settings.</p>
        )}
        {form.formState.errors.root ? (
          <Button
            variant="secondary"
            onClick={async () => {
              const latest = await onReload();
              if (latest) form.reset(formValues(latest));
            }}
          >
            Load latest settings
          </Button>
        ) : null}
      </div>
    </form>
  );
}
