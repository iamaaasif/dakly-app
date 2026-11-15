import { useFormContext } from 'react-hook-form';

import { howYouSellOptions, customerListSizes } from '@dakly/contracts/stores';

import type { BusinessDraft } from '../auth.types';
import { businessTypes, districts, salesLabels, sizeLabels } from '../business-options';
import { BusinessSelect } from './business-select';
import { FormField as AuthField } from '@/components/form-field';

export function BusinessFields() {
  const {
    register,
    formState: { errors },
  } = useFormContext<BusinessDraft>();
  return (
    <>
      <AuthField
        label="Business name"
        field={register('name')}
        error={errors.name}
        autoComplete="organization"
      />
      <BusinessSelect
        label="What you sell"
        field={register('businessType')}
        error={errors.businessType}
        options={businessTypes.map((name) => ({ value: name, label: name }))}
      />
      <BusinessSelect
        label="District"
        field={register('district')}
        error={errors.district}
        options={districts.map((name) => ({ value: name, label: name }))}
      />
      <fieldset className="space-y-2">
        <legend className="font-medium">How you sell</legend>
        {howYouSellOptions.map((value) => (
          <label key={value} className="flex min-h-10 items-center gap-3">
            <input type="checkbox" value={value} {...register('howYouSell')} />
            {salesLabels[value]}
          </label>
        ))}
        {errors.howYouSell ? (
          <p role="alert" className="text-danger">
            Choose at least one way you sell.
          </p>
        ) : null}
      </fieldset>
      <BusinessSelect
        label="Customer list size"
        field={register('customerListSize')}
        error={errors.customerListSize}
        options={customerListSizes.map((value) => ({ value, label: sizeLabels[value] }))}
      />
    </>
  );
}
