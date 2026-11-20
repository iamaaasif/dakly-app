import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';

import {
  type StartProductImportForm,
  type StartProductImportInput,
  startProductImportSchema,
} from '@dakly/contracts/product-imports';

import { useStartProductImport } from '../api/start-product-import';
import { guessProductImportMapping } from '../product-import-fields';
import { ProductImportDuplicatesStep } from './product-import-duplicates-step';
import { ProductImportMappingStep } from './product-import-mapping-step';
import { ProductImportPreviewStep } from './product-import-preview-step';
import { ProductImportResultStep } from './product-import-result-step';
import { ImportStepHeader } from '@/components/import-step-header';
import { ImportUploadStep } from '@/components/import-upload-step';
import { SessionDialog as Dialog } from '@/components/session-dialog';
import type { ImportFileSummary } from '@/lib/import-file';
import { productsKeys } from '@/lib/product-query-keys';

const template = {
  filename: 'dakly-products-template.csv',
  csv: 'Name,Price,Category,SKU,Cost,On hand,Size\r\nCotton kurti,1200,Kurti,KURTI-M,700,10,M\r\nCotton kurti,1200,Kurti,KURTI-L,700,6,L\r\n',
};
const steps = ['Upload', 'Map fields', 'Preview', 'Duplicates', 'Results'] as const;

type Upload = { importId: string; preview: ImportFileSummary };

export function ImportProductsDialog({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const [step, setStep] = useState(0);
  const [upload, setUpload] = useState<Upload>();
  const form = useForm<StartProductImportForm, unknown, StartProductImportInput>({
    resolver: zodResolver(startProductImportSchema),
    defaultValues: { mapping: { options: [] }, duplicateMode: 'update' },
  });

  // The list shows the new products once the window closes.
  const close = () => {
    void client.invalidateQueries({ queryKey: productsKeys.all });
    onClose();
  };

  return (
    <Dialog open title="Import products" onClose={close} className="max-w-3xl">
      <ImportStepHeader steps={steps} step={step} />
      {upload === undefined ? (
        <ImportUploadStep
          path="/product-imports"
          rowName="products"
          fileLabel="Product file"
          template={template}
          onUploaded={(uploaded) => {
            form.reset({
              ...form.getValues(),
              mapping: guessProductImportMapping(uploaded.preview.header),
            });
            setUpload(uploaded);
            setStep(1);
          }}
        />
      ) : (
        <FormProvider {...form}>
          <ImportSteps
            step={step}
            upload={upload}
            setStep={setStep}
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
  upload: Upload;
  setStep: (step: number) => void;
  restart: () => void;
  onDone: () => void;
};

function ImportSteps({ step, upload, setStep, restart, onDone }: ImportStepsProps) {
  const { handleSubmit } = useFormContext<
    StartProductImportForm,
    unknown,
    StartProductImportInput
  >();
  const start = useStartProductImport(upload.importId);
  if (step === 1)
    return (
      <ProductImportMappingStep
        header={upload.preview.header}
        onBack={restart}
        onNext={() => setStep(2)}
      />
    );
  if (step === 2)
    return (
      <ProductImportPreviewStep
        preview={upload.preview}
        onBack={() => setStep(1)}
        onNext={() => setStep(3)}
      />
    );
  if (step === 3)
    return (
      <form
        onSubmit={handleSubmit((input) => start.mutate(input, { onSuccess: () => setStep(4) }))}
      >
        <ProductImportDuplicatesStep
          error={start.error}
          loading={start.isPending}
          onBack={() => setStep(2)}
        />
      </form>
    );
  return <ProductImportResultStep importId={upload.importId} onDone={onDone} />;
}
