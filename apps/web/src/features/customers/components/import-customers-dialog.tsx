import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';

import { type StartImportInput, startImportSchema } from '@dakly/contracts/contacts';

import { customersKeys } from '../api/customers-keys';
import { useStartImport } from '../api/start-import';
import { dropUnmappedFields, guessImportMapping } from '../import-fields';
import type { ImportFileSummary } from '../import-file';
import { ImportConsentStep } from './import-consent-step';
import { ImportDuplicatesStep } from './import-duplicates-step';
import { ImportMappingStep } from './import-mapping-step';
import { ImportResultStep } from './import-result-step';
import { ImportUploadStep } from './import-upload-step';
import { SessionDialog as Dialog } from '@/components/session-dialog';

const steps = ['Upload', 'Map fields', 'Duplicates', 'Consent', 'Results'] as const;

type ImportCustomersDialogProps = { onClose: () => void };

export function ImportCustomersDialog({ onClose }: ImportCustomersDialogProps) {
  const client = useQueryClient();
  const [step, setStep] = useState(0);
  const [upload, setUpload] = useState<{ importId: string; preview: ImportFileSummary }>();
  const form = useForm<StartImportInput>({
    resolver: (values, context, options) =>
      zodResolver(startImportSchema)(
        { ...values, mapping: dropUnmappedFields(values.mapping) },
        context,
        options,
      ),
    defaultValues: { mapping: {}, duplicateMode: 'update', consentEvidence: {} },
  });

  // The list shows the new customers once the window closes.
  const close = () => {
    void client.invalidateQueries({ queryKey: customersKeys.all });
    onClose();
  };
  const back = () => setStep((current) => current - 1);
  const next = () => setStep((current) => current + 1);

  return (
    <Dialog open title="Import customers" onClose={close} className="max-w-3xl">
      <ImportStepHeader step={step} />
      {upload === undefined ? (
        <ImportUploadStep
          onUploaded={(uploaded) => {
            form.reset({
              ...form.getValues(),
              mapping: guessImportMapping(uploaded.preview.header),
            });
            setUpload(uploaded);
            next();
          }}
        />
      ) : (
        <FormProvider {...form}>
          <ImportSteps
            step={step}
            upload={upload}
            back={back}
            next={next}
            restart={() => {
              setUpload(undefined);
              setStep(0);
            }}
            onDone={close}
          />
        </FormProvider>
      )}
    </Dialog>
  );
}

type ImportStepsProps = {
  step: number;
  upload: { importId: string; preview: ImportFileSummary };
  back: () => void;
  next: () => void;
  restart: () => void;
  onDone: () => void;
};

function ImportSteps({ step, upload, back, next, restart, onDone }: ImportStepsProps) {
  const { handleSubmit } = useFormContext<StartImportInput>();
  const start = useStartImport(upload.importId);
  if (step === 1)
    return <ImportMappingStep header={upload.preview.header} onBack={restart} onNext={next} />;
  if (step === 2) return <ImportDuplicatesStep onBack={back} onNext={next} />;
  if (step === 3)
    return (
      <form onSubmit={handleSubmit((input) => start.mutate(input, { onSuccess: next }))}>
        <ImportConsentStep
          rowCount={upload.preview.rowCount}
          error={start.error}
          loading={start.isPending}
          onBack={back}
        />
      </form>
    );
  return <ImportResultStep importId={upload.importId} onDone={onDone} />;
}

function ImportStepHeader({ step }: { step: number }) {
  return (
    <>
      <p className="text-sm text-text-muted">
        Step {step + 1} of {steps.length} · {steps[step]}
      </p>
      <ol aria-hidden="true" className="my-4 grid grid-cols-5 gap-1">
        {steps.map((name, index) => (
          <li
            key={name}
            className={`h-1 rounded-full ${index <= step ? 'bg-action' : 'bg-surface-muted'}`}
          />
        ))}
      </ol>
    </>
  );
}
