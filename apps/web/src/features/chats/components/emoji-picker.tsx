'use client';
import { Smile } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@dakly/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@dakly/ui/popover';

// The ones shop replies use most; the phone keyboard has the rest.
const emoji = [
  '🙂',
  '😊',
  '🥰',
  '😍',
  '😄',
  '😅',
  '🙏',
  '👍',
  '👌',
  '🙌',
  '🤝',
  '👋',
  '❤️',
  '🔥',
  '✨',
  '🎉',
  '🎁',
  '⭐',
  '💯',
  '✅',
  '📦',
  '🚚',
  '🛍️',
  '😢',
];

export function EmojiPicker({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          type="button"
          size="sm"
          aria-label="Add emoji"
          disabled={disabled}
        >
          <Smile aria-hidden="true" size={16} />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-auto p-1">
        <div role="menu" aria-label="Emoji" className="grid grid-cols-6 gap-1">
          {emoji.map((item) => (
            <button
              key={item}
              type="button"
              role="menuitem"
              className="grid size-10 place-items-center rounded-sm text-xl hover:bg-surface-muted"
              onClick={() => {
                onPick(item);
                setOpen(false);
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
