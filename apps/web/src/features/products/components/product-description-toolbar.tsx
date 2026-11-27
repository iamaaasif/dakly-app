import { List, ListOrdered, Redo2, Undo2 } from 'lucide-react';
import type { RefObject } from 'react';

type ProductDescriptionToolbarProps = {
  target: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
};

const bullet = '• ';

// Descriptions are plain text because chat replies and the order link show them as typed.
export function ProductDescriptionToolbar({ target, onChange }: ProductDescriptionToolbarProps) {
  const run = (change: (box: HTMLTextAreaElement) => void) => () => {
    const box = target.current;
    if (!box) return;
    box.focus();
    change(box);
    onChange(box.value);
  };
  return (
    <div
      role="toolbar"
      aria-label="Description formatting"
      className="flex items-center gap-0.5 rounded-t-md border border-b-0 border-input-border bg-surface-muted px-1.5 py-1"
    >
      <ToolbarButton label="Bullet list" onClick={run((box) => toggleLines(box, () => bullet))}>
        <List aria-hidden="true" size={16} />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        onClick={run((box) => toggleLines(box, (index) => `${index + 1}. `))}
      >
        <ListOrdered aria-hidden="true" size={16} />
      </ToolbarButton>
      <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
      <ToolbarButton label="Undo description edit" onClick={run(() => document.execCommand('undo'))}>
        <Undo2 aria-hidden="true" size={16} />
      </ToolbarButton>
      <ToolbarButton label="Redo description edit" onClick={run(() => document.execCommand('redo'))}>
        <Redo2 aria-hidden="true" size={16} />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      // Keeps the text selection in the box while the button is pressed.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="rounded inline-flex size-8 items-center justify-center text-text-muted transition-colors hover:bg-surface hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
    >
      {children}
    </button>
  );
}

const listMarker = /^(?:• |\d+\. )/;

// Adds a marker to each selected line, or removes it when every line already has one.
function toggleLines(box: HTMLTextAreaElement, marker: (index: number) => string) {
  const { value, selectionStart, selectionEnd } = box;
  const start = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const lineEnd = value.indexOf('\n', selectionEnd);
  const end = lineEnd === -1 ? value.length : lineEnd;
  const lines = value.slice(start, end).split('\n');
  const marked = lines.every((line) => listMarker.test(line));
  const next = lines
    .map((line, index) => {
      const bare = line.replace(listMarker, '');
      return marked ? bare : `${marker(index)}${bare}`;
    })
    .join('\n');
  box.setSelectionRange(start, end);
  // insertText keeps the browser's undo history; the fallback covers environments without it.
  if (!document.execCommand?.('insertText', false, next))
    box.setRangeText(next, start, end, 'select');
}
