import type { UseFormReturn } from 'react-hook-form';

import type { BrandValues } from './brand-form';

export type BrandSectionProps = { form: UseFormReturn<BrandValues>; disabled: boolean };
