import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import {
  saveAgentSettingsSchema,
  type AgentSettingsResponse,
  type SaveAgentSettingsInput,
} from '@dakly/contracts/ai-agent-settings';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';
import { useToast } from '@dakly/ui/toast';

import { useAgentSettings, useSaveAgentSettings } from '../api/agent-settings';
import { AgentSettingsFields } from './agent-settings-fields';
import { formError } from '@/lib/form-error';

function formValues({ handoverRulesSaved: _saved, ...values }: AgentSettingsResponse) {
  return values;
}

export function AgentSettingsTab({ canEdit }: { canEdit: boolean }) {
  const settings = useAgentSettings();
  if (settings.isPending) return <Skeleton className="h-96 w-full" />;
  if (settings.isError)
    return <QueryError message={settings.error.message} onRetry={() => void settings.refetch()} />;
  // Keyed by version so a reload after a stale save resets the form to the saved values.
  return (
    <SettingsForm
      key={settings.data.version}
      saved={settings.data}
      canEdit={canEdit}
      onReload={() => void settings.refetch()}
    />
  );
}

type SettingsFormProps = {
  saved: AgentSettingsResponse;
  canEdit: boolean;
  onReload: () => void;
};

function SettingsForm({ saved, canEdit, onReload }: SettingsFormProps) {
  const form = useForm<SaveAgentSettingsInput>({
    resolver: zodResolver(saveAgentSettingsSchema),
    defaultValues: formValues(saved),
  });
  const save = useSaveAgentSettings();
  const showToast = useToast();
  const submit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values);
      showToast('AI agent settings saved.');
    } catch (error) {
      formError(error, form.setError);
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
          <Button variant="secondary" onClick={onReload}>
            Load latest settings
          </Button>
        ) : null}
      </div>
    </form>
  );
}
