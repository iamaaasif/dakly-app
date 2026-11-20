import type { UseFormReturn } from 'react-hook-form';

import type { ContentWriteInput } from '@dakly/contracts/content-writing';

export type GenerateInput = Extract<ContentWriteInput, { operation: 'generate' }>;
export type GenerateForm = UseFormReturn<GenerateInput>;
