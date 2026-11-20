import { Label } from '@dakly/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import { useProductChoices } from '../api/get-products';
import type { GenerateForm } from './generate-form-types';

const noProduct = 'none';

export function ProductField({ form, required }: { form: GenerateForm; required: boolean }) {
  const products = useProductChoices();
  return (
    <div className="space-y-1.5">
      <Label htmlFor="content-product">
        Product{' '}
        {!required && <span className="block text-xs font-normal text-text-muted">Optional</span>}
      </Label>
      <Select
        value={form.watch('productId') ?? noProduct}
        onValueChange={(id) => form.setValue('productId', id === noProduct ? undefined : id)}
      >
        <SelectTrigger id="content-product">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={noProduct}>Any or none</SelectItem>
          {products.data?.map(({ id, name }) => (
            <SelectItem key={id} value={id}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
