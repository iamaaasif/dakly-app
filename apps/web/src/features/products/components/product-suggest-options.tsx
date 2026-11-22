'use client';
import { X } from 'lucide-react';
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';

import type {
  ProductFormValues,
  ProductResponse,
  SuggestedOptionsResponse,
} from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';

import { useSuggestProductOptions } from '../api/suggest-product-options';
import { colourSuggestions, sizeSuggestions, type GridOption } from '../product-variant-grid';

const plainSuggestions: SuggestedOptionsResponse['options'] = [
  { name: 'Size', values: sizeSuggestions },
  { name: 'Colour', values: colourSuggestions },
];

type Suggestion = { fromAi: boolean; options: SuggestedOptionsResponse['options'] };

type ProductSuggestOptionsProps = {
  product?: ProductResponse;
  onAdd: (suggested: GridOption[]) => void;
};

export function ProductSuggestOptions({ product, onAdd }: ProductSuggestOptionsProps) {
  const productId = product?.id;
  const hasPhotos = Boolean(product?.photos.length);
  const { watch } = useFormContext<ProductFormValues>();
  const suggest = useSuggestProductOptions();
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const name = (watch('name') ?? '').trim();
  const ask = () => {
    if (!name && !(productId && hasPhotos))
      return setSuggestion({ fromAi: false, options: plainSuggestions });
    suggest.mutate(
      { name, productId },
      {
        onSuccess: ({ options }) =>
          setSuggestion(
            options.length
              ? { fromAi: true, options }
              : { fromAi: false, options: plainSuggestions },
          ),
        onError: () => setSuggestion({ fromAi: false, options: plainSuggestions }),
      },
    );
  };
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        className="h-8 px-2.5 text-xs"
        loading={suggest.isPending}
        onClick={ask}
      >
        <span aria-hidden="true">✦ </span>Suggest options
      </Button>
      {suggestion ? (
        <SuggestionBox
          suggestion={suggestion}
          onAdd={(options) => {
            onAdd(options);
            setSuggestion(null);
          }}
          onDismiss={() => setSuggestion(null)}
        />
      ) : null}
    </div>
  );
}

type SuggestionBoxProps = {
  suggestion: Suggestion;
  onAdd: (options: GridOption[]) => void;
  onDismiss: () => void;
};

function SuggestionBox({ suggestion, onAdd, onDismiss }: SuggestionBoxProps) {
  const [options, setOptions] = useState(suggestion.options);
  const remove = (name: string, value: string) =>
    setOptions((current) =>
      current.map((option) =>
        option.name === name
          ? { ...option, values: option.values.filter((candidate) => candidate !== value) }
          : option,
      ),
    );
  const chosen = options.filter((option) => option.values.length);
  return (
    <div className="space-y-2 rounded-lg border border-ai-soft bg-ai-soft p-3">
      <p className="text-sm text-ai">
        <span aria-hidden="true">✦ </span>
        {suggestion.fromAi ? 'Suggested from the title and photos' : 'Common options to start from'}
      </p>
      {options.map((option) => (
        <div key={option.name} className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-text-muted">{option.name}</span>
          {option.values.map((value) => (
            <span
              key={value}
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border-strong bg-surface px-2.5 text-sm text-text"
            >
              {value}
              <button
                type="button"
                aria-label={`Remove suggested ${value}`}
                className="rounded-full p-0.5 text-text-muted hover:text-danger"
                onClick={() => remove(option.name, value)}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          className="h-8 px-3 text-xs"
          disabled={!chosen.length}
          onClick={() => onAdd(chosen)}
        >
          Add all
        </Button>
        <Button type="button" variant="secondary" className="h-8 px-3 text-xs" onClick={onDismiss}>
          Dismiss
        </Button>
        <p className="text-xs text-text-muted">
          Nothing is added until you tap. Price, stock and code stay blank.
        </p>
      </div>
    </div>
  );
}
