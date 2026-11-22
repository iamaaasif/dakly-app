import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import {
  type StartProductImportForm,
  type StartProductImportInput,
  startProductImportSchema,
} from '@dakly/contracts/product-imports';

import { guessProductImportMapping } from '../product-import-fields';
import { ProductImportDryRunStep } from './product-import-dry-run-step';
import { ProductImportMappingStep } from './product-import-mapping-step';
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
const steps = ['Upload', 'Map fields', 'Dry run', 'Results'] as const;

type Upload = { importId: string; preview: ImportFileSummary; csv: File };

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
          excel
          onUploaded={(uploaded) => {
            form.reset({
              ...form.getValues(),
              mapping: guessProductImportMapping(uploaded.preview.header),
            });
            setUpload({
              importId: uploaded.importId,
              preview: uploaded.preview,
              csv: uploaded.csv,
            });
            setStep(1);
          }}
        />
      ) : (
        <FormProvider {...form}>
          <ImportSteps
            step={step}
            upload={upload}
            setStep={setStep}
            replace={(replaced) => setUpload({ ...upload, ...replaced })}
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
  replace: (upload: Pick<Upload, 'importId' | 'csv'>) => void;
  restart: () => void;
  onDone: () => void;
};

function ImportSteps({ step, upload, setStep, replace, restart, onDone }: ImportStepsProps) {
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
      <ProductImportDryRunStep
        importId={upload.importId}
        csv={upload.csv}
        onReplaced={replace}
        onBack={() => setStep(1)}
        onStarted={() => setStep(3)}
      />
    );
  return <ProductImportResultStep importId={upload.importId} onDone={onDone} />;
}
