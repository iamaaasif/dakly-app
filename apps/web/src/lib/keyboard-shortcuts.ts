export type ShortcutAction = 'search' | 'new' | 'help' | 'escape' | 'submit' | 'save';

export const shortcutHelp: { keys: string; action: string }[] = [
  { keys: '/', action: 'Search this page' },
  { keys: 'n', action: 'Start a new item on a list page' },
  { keys: '?', action: 'Show this list' },
  { keys: 'Esc', action: 'Close a panel, dialog or search' },
  { keys: 'Ctrl or ⌘ + Enter', action: 'Submit the form you are in' },
  { keys: 'Ctrl or ⌘ + S', action: 'Save the form you are in' },
];

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function modifierAction(event: { key: string }): ShortcutAction | undefined {
  if (event.key === 'Enter') return 'submit';
  return event.key.toLowerCase() === 's' ? 'save' : undefined;
}

const plainKeys: Record<string, ShortcutAction> = { '/': 'search', n: 'new', '?': 'help' };

// Plain keys stay out of the way while typing; Esc and the modifier combos work everywhere.
export function shortcutAction(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}): ShortcutAction | undefined {
  if (event.altKey) return undefined;
  if (event.ctrlKey || event.metaKey) return modifierAction(event);
  if (event.key === 'Escape') return 'escape';
  return isTypingTarget(event.target) ? undefined : plainKeys[event.key];
}

function visible(element: HTMLElement) {
  return element.checkVisibility?.() ?? true;
}

export function findShortcutTarget(selector: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>(selector)].find(visible);
}
