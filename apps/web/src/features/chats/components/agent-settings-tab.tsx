import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import {
  saveAgentSettingsSchema,
  type AgentSettingsResponse,
  type SaveAgentSettingsInput,
} from '@dakly/contracts/ai-agent-settings';
import { ApiError } from '@dakly/ui/api-client';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';
import { useToast } from '@dakly/ui/toast';

import { formValues } from '../agent-settings-values';
import { useAgentSettings, useSaveAgentSettings } from '../api/agent-settings';
import { AgentSettingsFields } from './agent-settings-fields';
import { AgentSettingsSaveBar, type LeaveRequest } from './agent-settings-save-bar';
import { formError } from '@/lib/form-error';

// Settings, testers and test questions share one version, so any of them can make a save stale.
const staleMessage =
  'These settings were changed somewhere else since you opened them, so your edits were not saved. Load the latest settings and make your change again.';

type AgentSettingsTabProps = {
  canEdit: boolean;
  onDirtyChange: (dirty: boolean) => void;
  leave: LeaveRequest | null;
};

export function AgentSettingsTab({ canEdit, onDirtyChange, leave }: AgentSettingsTabProps) {
  const settings = useAgentSettings();
  if (settings.isPending) return <Skeleton className="h-96 w-full" />;
  if (settings.isError)
    return <QueryError message={settings.error.message} onRetry={() => void settings.refetch()} />;
  return (
    <SettingsForm
      saved={settings.data}
      canEdit={canEdit}
      onDirtyChange={onDirtyChange}
      leave={leave}
      onReload={async () => (await settings.refetch()).data}
    />
  );
}

type SettingsFormProps = {
  saved: AgentSettingsResponse;
  canEdit: boolean;
  onDirtyChange: (dirty: boolean) => void;
  leave: LeaveRequest | null;
  onReload: () => Promise<AgentSettingsResponse | undefined>;
};

function SettingsForm({ saved, canEdit, onDirtyChange, leave, onReload }: SettingsFormProps) {
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
  const isDirty = form.formState.isDirty;
  useEffect(() => {
    onDirtyChange(isDirty);
    if (!isDirty) return;
    // The browser's own prompt covers a reload or a closed tab, which the drawer cannot see.
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
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
      <AgentSettingsSaveBar
        canEdit={canEdit}
        isDirty={isDirty}
        saving={save.isPending}
        leave={leave}
        hasConflict={Boolean(form.formState.errors.root)}
        onDiscard={() => form.reset(formValues(saved))}
        onReload={async () => {
          const latest = await onReload();
          if (latest) form.reset(formValues(latest));
        }}
      />
    </form>
  );
}
