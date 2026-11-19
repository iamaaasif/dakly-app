import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import {
  productDescriptionRequestSchema,
  type ProductDescriptionInput,
} from '@dakly/contracts/content-writing';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';

import { useWriteProductDescription } from '../api/write-product-description';

const preferences = [
  {
    name: 'tone',
    label: 'Tone',
    choices: {
      friendly: 'Friendly',
      festive: 'Festive',
      urgent: 'Urgent',
      premium: 'Premium',
      playful: 'Playful',
    },
  },
  {
    name: 'language',
    label: 'Language',
    choices: { en: 'English', bn: 'Bangla', banglish: 'Banglish' },
  },
] as const;

type ProductDescriptionWriterProps = { productId: string; onPick: (body: string) => void };

export function ProductDescriptionWriter({ productId, onPick }: ProductDescriptionWriterProps) {
  const write = useWriteProductDescription(productId);
  const { handleSubmit, register } = useForm<ProductDescriptionInput>({
    resolver: zodResolver(productDescriptionRequestSchema),
    defaultValues: { tone: 'friendly', language: 'en' },
  });

  return (
    <div className="space-y-3">
      <div className="grid gap-3">
        {preferences.map(({ name, label, choices }) => (
          <fieldset key={name} disabled={write.isPending}>
            <legend className="mb-1 text-sm font-medium">{label}</legend>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(choices).map(([value, text]) => (
                <label key={value} className="cursor-pointer has-disabled:cursor-default">
                  <input
                    {...register(name, { onChange: () => write.reset() })}
                    type="radio"
                    value={value}
                    className="peer sr-only"
                  />
                  <span className="flex min-h-10 items-center rounded-full border border-input-border px-3 text-sm peer-checked:border-action peer-checked:text-action peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
                    {text}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      {write.isError && (
        <p role="alert" className="text-sm text-danger">
          {write.error.message}
        </p>
      )}
      <Button loading={write.isPending} onClick={handleSubmit((input) => write.mutate(input))}>
        {write.isError ? 'Try again' : 'Write 3 options'}
      </Button>
      {write.data && (
        <div className="space-y-2">
          <Badge variant="ai">AI options</Badge>
          <ul className="space-y-2" aria-label="AI description options">
            {write.data.options.map((option) => (
              <li key={option}>
                <Button
                  variant="secondary"
                  className="w-full justify-start text-left wrap-anywhere whitespace-pre-wrap"
                  onClick={() => onPick(option)}
                >
                  {option}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
