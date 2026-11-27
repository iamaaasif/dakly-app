'use client';

import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import { useRef, useState, type DragEvent, type RefCallback } from 'react';
import { useFormContext } from 'react-hook-form';

import {
  createProductSchema,
  type ProductFormValues,
  type ProductResponse,
} from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@dakly/ui/dropdown-menu';

import {
  MAX_OPTIONS,
  MAX_VARIANTS,
  applyOptions,
  moveOption,
  optionNameKey,
  removeOptionAt,
  withSuggestions,
  type GridOption,
} from '../product-variant-grid';
import { OptionChips, OptionDraft } from './product-option-draft';
import { ProductSuggestOptions } from './product-suggest-options';

const dirty = { shouldDirty: true } as const;
const optionStarts = ['Color', 'Size', 'Material', 'Other option'] as const;

export function useGridOptions() {
  const form = useFormContext<ProductFormValues>();
  const options: GridOption[] = form.watch('options') ?? [];
  const variants = form.watch('variants') ?? [];
  const write = (next: ReturnType<typeof moveOption>) => {
    form.setValue('options', next.options, dirty);
    form.setValue('variants', next.variants, dirty);
  };
  return {
    options,
    variants,
    setOptions: (next: GridOption[]) =>
      write({ options: next, variants: applyOptions(options, next, variants) }),
    removeOption: (index: number) => write(removeOptionAt(options, variants, index)),
    reorderOption: (from: number, to: number) => write(moveOption(options, variants, { from, to })),
  };
}

type EditingOption = { index: number; option: GridOption };

type ProductOptionEditorProps = {
  product?: ProductResponse;
  onDraftChange: (editing: boolean) => void;
};

export function ProductOptionEditor({ product, onDraftChange }: ProductOptionEditorProps) {
  const grid = useGridOptions();
  const { options, variants, setOptions, removeOption } = grid;
  const [editing, setEditing] = useState<EditingOption | null>(null);
  const canRemove = options.length > 1 || variants.length <= 1;
  const { focusTarget, restoreFocus } = useOptionFocus();
  const close = (action: string) => {
    focusTarget.current = action;
    setEditing(null);
    onDraftChange(false);
  };
  if (editing)
    return (
      <OptionDraft
        option={editing.option}
        onApply={(draft) => {
          const result = applyOptionDraft(options, editing.index, draft);
          if (typeof result === 'string') return result;
          setOptions(result);
          close(`edit:${result[editing.index]!.name}`);
          return null;
        }}
        onCancel={() => close(editingAction(editing, options.length))}
        onDelete={
          editing.index < options.length && canRemove
            ? () => {
                removeOption(editing.index);
                close('');
              }
            : undefined
        }
      />
    );
  return (
    <OptionSettings
      grid={grid}
      product={product}
      onEdit={(draft) => {
        setEditing(draft);
        onDraftChange(true);
      }}
      restoreFocus={restoreFocus}
    />
  );
}

function useOptionFocus() {
  const focusTarget = useRef<string | null>(null);
  const restoreFocus = (element: HTMLDivElement | null) => {
    if (!element || focusTarget.current === null) return;
    const actions = [...element.querySelectorAll<HTMLButtonElement>('button[data-option-action]')];
    const target = actions.find(({ dataset }) => dataset.optionAction === focusTarget.current);
    (target ?? actions[0])?.focus();
    focusTarget.current = null;
  };
  return { focusTarget, restoreFocus };
}

type OptionSettingsProps = {
  grid: ReturnType<typeof useGridOptions>;
  product?: ProductResponse;
  onEdit: (editing: EditingOption) => void;
  restoreFocus: RefCallback<HTMLDivElement>;
};

function OptionSettings({ grid, product, onEdit, restoreFocus }: OptionSettingsProps) {
  const { options, variants, removeOption, reorderOption, setOptions } = grid;
  return (
    <div className="space-y-3" ref={restoreFocus}>
      <SavedOptions
        options={options}
        canRemove={options.length > 1 || variants.length <= 1}
        onEdit={(index) => onEdit({ index, option: options[index]! })}
        onRemove={removeOption}
        onMove={reorderOption}
      />
      <div className="flex flex-wrap items-center gap-2">
        {options.length < MAX_OPTIONS ? (
          <StartOptions
            options={options}
            onStart={(name) => onEdit({ index: options.length, option: { name, values: [] } })}
          />
        ) : null}
        <ProductSuggestOptions
          product={product}
          onAdd={(suggested) => {
            const next = withSuggestions(options, suggested);
            const problem = variantLimitError(next);
            if (!problem) setOptions(next);
            return problem;
          }}
        />
      </div>
    </div>
  );
}

function applyOptionDraft(options: GridOption[], index: number, draft: GridOption) {
  const parsed = createProductSchema.shape.options.unwrap().element.safeParse(draft);
  if (!parsed.success) return parsed.error.issues[0]!.message;
  const next = [...options];
  next[index] = parsed.data;
  const name = optionNameKey(parsed.data.name);
  if (options.some((option, position) => position !== index && optionNameKey(option.name) === name))
    return 'Choose a different option name.';
  return variantLimitError(next) ?? next;
}

function variantLimitError(options: GridOption[]) {
  if (options.reduce((total, option) => total * option.values.length, 1) <= MAX_VARIANTS)
    return null;
  return `A product can have up to ${MAX_VARIANTS} variants. Remove a value first.`;
}

function editingAction(editing: EditingOption, optionCount: number) {
  if (editing.index < optionCount) return `edit:${editing.option.name}`;
  return `start:${editing.option.name || 'Other option'}`;
}

function StartOptions({
  options,
  onStart,
}: {
  options: GridOption[];
  onStart: (name: string) => void;
}) {
  const names = new Set(options.map(({ name }) => optionNameKey(name)));
  return optionStarts
    .filter((name) => name === 'Other option' || !names.has(optionNameKey(name)))
    .map((name) => (
      <Button
        key={name}
        data-option-action={`start:${name}`}
        variant="secondary"
        onClick={() => onStart(name === 'Other option' ? '' : name)}
      >
        + {name}
      </Button>
    ));
}

type SavedOptionsProps = {
  options: GridOption[];
  canRemove: boolean;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
  onMove: (from: number, to: number) => void;
};

function SavedOptions({ options, canRemove, onEdit, onRemove, onMove }: SavedOptionsProps) {
  const [dragging, setDragging] = useState<number | null>(null);
  if (!options.length) return null;
  return (
    <ul
      aria-label="Product options"
      className="divide-y divide-border rounded-lg border border-border"
    >
      {options.map((option, index) => (
        <li
          key={option.name}
          className="flex items-start gap-2 p-2"
          onDragOver={(event) => {
            if (dragging !== null) event.preventDefault();
          }}
          onDrop={(event) => {
            if (dragging === null) return;
            event.preventDefault();
            if (dragging !== index) onMove(dragging, index);
            setDragging(null);
          }}
        >
          <OptionMoveControls
            name={option.name}
            index={index}
            count={options.length}
            onMove={(to) => onMove(index, to)}
            onStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', option.name);
              setDragging(index);
            }}
            onStop={() => setDragging(null)}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium break-words">{option.name}</p>
            <OptionChips option={option} />
          </div>
          <OptionRowActions
            option={option.name}
            canRemove={canRemove}
            onEdit={() => onEdit(index)}
            onRemove={() => onRemove(index)}
          />
        </li>
      ))}
    </ul>
  );
}

type OptionMoveControlsProps = {
  name: string;
  index: number;
  count: number;
  onMove: (to: number) => void;
  onStart: (event: DragEvent<HTMLButtonElement>) => void;
  onStop: () => void;
};

function OptionMoveControls({
  name,
  index,
  count,
  onMove,
  onStart,
  onStop,
}: OptionMoveControlsProps) {
  const icon = <GripVertical size={16} aria-hidden="true" />;
  return (
    <>
      <Button
        variant="secondary"
        className="hidden cursor-grab px-0 md:inline-flex pointer-coarse:hidden"
        aria-label={`Move ${name}`}
        aria-keyshortcuts="ArrowUp ArrowDown"
        disabled={count < 2}
        draggable={count > 1}
        onDragStart={onStart}
        onDragEnd={onStop}
        onKeyDown={(event) => {
          const next = keyboardPosition(event.key, index, count);
          if (next === index) return;
          event.preventDefault();
          const handle = event.currentTarget;
          onMove(next);
          requestAnimationFrame(() => handle.focus());
        }}
      >
        {icon}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            className="px-0 md:hidden pointer-coarse:inline-flex"
            aria-label={`Reorder ${name}`}
            disabled={count < 2}
          >
            {icon}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(index - 1)}>
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === count - 1} onSelect={() => onMove(index + 1)}>
            Move down
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function keyboardPosition(key: string, index: number, length: number) {
  if (key === 'ArrowUp') return Math.max(0, index - 1);
  if (key === 'ArrowDown') return Math.min(length - 1, index + 1);
  return index;
}

type OptionRowActionsProps = {
  option: string;
  canRemove: boolean;
  onEdit: () => void;
  onRemove: () => void;
};

function OptionRowActions({ option, canRemove, onEdit, onRemove }: OptionRowActionsProps) {
  return (
    <>
      <Button
        variant="secondary"
        data-option-action={`edit:${option}`}
        aria-label={`Edit ${option}`}
        onClick={onEdit}
        className="px-0"
      >
        <Pencil size={16} aria-hidden="true" />
      </Button>
      <Button
        variant="secondary"
        aria-label={`Delete ${option}`}
        onClick={onRemove}
        disabled={!canRemove}
        title={canRemove ? undefined : 'Remove all but one variant first'}
        className="px-0"
      >
        <Trash2 size={16} aria-hidden="true" />
      </Button>
    </>
  );
}
