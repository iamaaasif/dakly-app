import { useController } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { FormField } from '@dakly/ui/form-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

type ProductStatusFieldProps = {
  savedStatus?: ProductFormValues['status'] | 'archived';
  onChangeStatus?: (status: 'active' | 'hidden') => void;
  disabled?: boolean;
};

export function ProductStatusField({
  savedStatus,
  onChangeStatus,
  disabled,
}: ProductStatusFieldProps) {
  const { field } = useController<ProductFormValues, 'status'>({ name: 'status' });
  return (
    <>
      <FormField name="status" label="Status">
        {(control) => (
          <Select
            value={savedStatus ?? field.value}
            onValueChange={onChangeStatus ?? field.onChange}
            disabled={disabled}
          >
            <SelectTrigger {...control} ref={field.ref} onBlur={field.onBlur}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
              {savedStatus === 'archived' ? (
                <SelectItem value="archived" disabled>
                  Archived
                </SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        )}
      </FormField>
      <p className="text-xs text-text-muted">
        Hidden products do not appear in chat replies or the order link.
      </p>
    </>
  );
}
