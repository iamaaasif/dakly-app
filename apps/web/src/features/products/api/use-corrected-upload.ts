import { useState } from 'react';

import type { StartProductImportInput } from '@dakly/contracts/product-imports';

import { applyCellEdits, type CellEdit } from '@/lib/csv-edit';
import { useUploadImport } from '@/lib/use-upload-import';

function columnOf(input: StartProductImportInput, field: string): number | undefined {
  if (field.startsWith('option:'))
    return input.mapping.options.find(({ name }) => name === field.slice('option:'.length))?.column;
  const found = Object.entries(input.mapping).find(([name]) => name === field)?.[1];
  return typeof found === 'number' ? found : undefined;
}

// Cell edits are keyed `row:field`. Applying them makes a new CSV and uploads it as a new import,
// so the file that is checked is the file that is imported.
export function useCorrectedUpload(csv: File, mapping: StartProductImportInput | undefined) {
  const [edits, setEdits] = useState(new Map<string, string>());
  const upload = useUploadImport('/product-imports');
  const apply = async (onReplaced: (upload: { importId: string; csv: File }) => void) => {
    const cellEdits = [...edits].flatMap(([key, value]): CellEdit[] => {
      const colon = key.indexOf(':');
      const column = mapping && columnOf(mapping, key.slice(colon + 1));
      return column === undefined
        ? []
        : [{ rowNumber: Number(key.slice(0, colon)), column, value }];
    });
    const text = new TextDecoder().decode(await csv.arrayBuffer());
    const fixed = new File([applyCellEdits(text, cellEdits)], csv.name, { type: 'text/csv' });
    upload.mutate(fixed, {
      onSuccess: (importId) => {
        setEdits(new Map());
        onReplaced({ importId, csv: fixed });
      },
    });
  };
  const edit = (rowNumber: number, key: string, value: string) =>
    setEdits((previous) => new Map(previous).set(`${rowNumber}:${key}`, value));
  return { edits, edit, apply, uploading: upload.isPending, error: upload.error };
}
