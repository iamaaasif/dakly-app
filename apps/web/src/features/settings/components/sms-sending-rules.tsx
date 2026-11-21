'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { FormProvider, useForm, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import type { StoreSettingsResponse } from '@dakly/contracts/stores';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';
import { Switch } from '@dakly/ui/switch';
import { useToast } from '@dakly/ui/toast';

import { useChangeSettings } from '../api/change-settings';
import { useStoreSettings } from '../api/store-settings';
import { useSessionContext } from '@/lib/session-context';

// Quiet hours are whole hours: the pause starts between 8 and 10 pm and ends between 8 and 10 am.
const hourOnTheHour = (from: number, to: number, message: string) =>
  z
    .string()
    .regex(/^\d{2}:00$/, message)
    .refine((time) => Number(time.slice(0, 2)) >= from && Number(time.slice(0, 2)) <= to, message);

const perDayMessage = 'Enter a whole number from 1 to 1,000,000.';

const rulesFormSchema = z.object({
  quietHoursOn: z.boolean(),
  pauseFrom: hourOnTheHour(20, 22, 'Choose a time on the hour from 8:00 pm to 10:00 pm.'),
  startAgainAt: hourOnTheHour(8, 10, 'Choose a time on the hour from 8:00 am to 10:00 am.'),
  dailyLimitOn: z.boolean(),
  perDay: z
    .string()
    .regex(/^\d+$/, perDayMessage)
    .transform(Number)
    .refine((count) => count >= 1 && count <= 1_000_000, perDayMessage),
});
type RulesForm = z.input<typeof rulesFormSchema>;
type RulesValues = z.output<typeof rulesFormSchema>;

const toTime = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

function formValues({ sending }: StoreSettingsResponse): RulesForm {
  return {
    quietHoursOn: sending.sms.quietHoursOn,
    pauseFrom: toTime(sending.quietHours.startHour),
    startAgainAt: toTime(sending.quietHours.endHour),
    dailyLimitOn: sending.sms.dailyLimit.on,
    perDay: String(sending.sms.dailyLimit.perDay),
  };
}

export function SmsSendingRules() {
  const { data: session } = useSessionContext();
  const editable = Boolean(session?.currentStore?.canEditStoreSettings);
  const settings = useStoreSettings();
  return (
    <section
      aria-labelledby="sending-rules-heading"
      className="space-y-4 rounded-lg border border-border bg-surface p-4 md:p-6"
    >
      <div>
        <h2 id="sending-rules-heading" className="text-lg font-semibold">
          Sending rules
        </h2>
        <p className="mt-1 text-sm text-text-muted">Protect your customers and your sender name.</p>
      </div>
      {settings.isPending ? <Skeleton className="h-32 w-full" /> : null}
      {settings.error ? (
        <QueryError message={settings.error.message} onRetry={() => void settings.refetch()} />
      ) : null}
      {settings.data ? <RulesFields store={settings.data} editable={editable} /> : null}
    </section>
  );
}

function useSaveRules(store: StoreSettingsResponse) {
  const showToast = useToast();
  const change = useChangeSettings();
  const [saveError, setSaveError] = useState<string>();
  const send = async (parsed: RulesValues) => {
    setSaveError(undefined);
    try {
      await change.mutateAsync({
        sending: {
          ...store.sending,
          quietHours: {
            startHour: Number(parsed.pauseFrom.slice(0, 2)),
            endHour: Number(parsed.startAgainAt.slice(0, 2)),
          },
          sms: {
            quietHoursOn: parsed.quietHoursOn,
            dailyLimit: { on: parsed.dailyLimitOn, perDay: parsed.perDay },
          },
        },
      });
      showToast('Sending rules saved.');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save the sending rules.');
    }
  };
  return { send, saveError, pending: change.isPending };
}

function RulesFields({ store, editable }: { store: StoreSettingsResponse; editable: boolean }) {
  const { send, saveError, pending } = useSaveRules(store);
  const form = useForm<RulesForm, unknown, RulesValues>({
    resolver: zodResolver(rulesFormSchema),
    defaultValues: formValues(store),
    values: formValues(store),
  });
  const save = form.handleSubmit(send);
  const toggle = (name: 'quietHoursOn' | 'dailyLimitOn') => (checked: boolean) => {
    form.setValue(name, checked);
    void save();
  };
  const rule = { form, save, toggle, disabled: !editable || pending };
  return (
    <FormProvider {...form}>
      <form onSubmit={(event) => void save(event)} noValidate className="space-y-4">
        <QuietHoursRule {...rule} />
        <hr className="border-border" />
        <DailyLimitRule {...rule} />
        {saveError ? (
          <p role="alert" className="text-sm text-danger">
            {saveError}
          </p>
        ) : null}
      </form>
    </FormProvider>
  );
}

type RuleProps = {
  form: UseFormReturn<RulesForm, unknown, RulesValues>;
  save: () => Promise<void>;
  toggle: (name: 'quietHoursOn' | 'dailyLimitOn') => (checked: boolean) => void;
  disabled: boolean;
};

function QuietHoursRule({ form, save, toggle, disabled }: RuleProps) {
  const on = form.watch('quietHoursOn');
  return (
    <>
      <RuleRow
        id="quiet-hours"
        title="Don’t send at night"
        text="Marketing SMS wait until morning. Order updates still go out right away."
        checked={on}
        disabled={disabled}
        onChange={toggle('quietHoursOn')}
      />
      {on ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <TimeField
            form={form}
            name="pauseFrom"
            label="Pause from"
            editable={!disabled}
            save={save}
          />
          <TimeField
            form={form}
            name="startAgainAt"
            label="Start again at"
            editable={!disabled}
            save={save}
          />
        </div>
      ) : null}
    </>
  );
}

function DailyLimitRule({ form, save, toggle, disabled }: RuleProps) {
  const on = form.watch('dailyLimitOn');
  return (
    <>
      <RuleRow
        id="daily-limit"
        title="Daily sending limit"
        text={
          on
            ? 'On. Big campaigns are spread over a few days so you don’t use all your credits at once.'
            : 'Off. Campaigns go to everyone on the same day, however many SMS that takes.'
        }
        checked={on}
        disabled={disabled}
        onChange={toggle('dailyLimitOn')}
      />
      {on ? (
        <FormField
          name="perDay"
          label="Most SMS per day"
          hint="Anything over this waits until the next day."
        >
          {(control) => (
            <Input
              {...control}
              {...form.register('perDay', { onBlur: () => void save() })}
              type="number"
              min={1}
              inputMode="numeric"
              disabled={disabled}
              className="max-w-52"
            />
          )}
        </FormField>
      ) : null}
    </>
  );
}

function RuleRow(props: {
  id: string;
  title: string;
  text: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p id={`${props.id}-label`} className="font-semibold">
          {props.title}
        </p>
        <p className="text-sm text-text-muted">{props.text}</p>
      </div>
      <Switch
        checked={props.checked}
        disabled={props.disabled}
        aria-labelledby={`${props.id}-label`}
        onCheckedChange={props.onChange}
      />
    </div>
  );
}

function TimeField(props: {
  form: UseFormReturn<RulesForm, unknown, RulesValues>;
  name: 'pauseFrom' | 'startAgainAt';
  label: string;
  editable: boolean;
  save: () => Promise<void>;
}) {
  const { form, name, label, editable, save } = props;
  return (
    <FormField name={name} label={label}>
      {(control) => (
        <Input
          {...control}
          {...form.register(name, { onBlur: () => void save() })}
          type="time"
          step={3600}
          disabled={!editable}
        />
      )}
    </FormField>
  );
}
