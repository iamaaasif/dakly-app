// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { shortcutAction } from './keyboard-shortcuts';

const base = { ctrlKey: false, metaKey: false, altKey: false, target: null };

describe('shortcutAction', () => {
  it('reads plain keys outside inputs', () => {
    expect(shortcutAction({ ...base, key: '/' })).toBe('search');
    expect(shortcutAction({ ...base, key: 'n' })).toBe('new');
    expect(shortcutAction({ ...base, key: '?' })).toBe('help');
  });

  it('ignores plain keys while typing but keeps Esc and the modifier combos', () => {
    const target = document.createElement('input');
    expect(shortcutAction({ ...base, key: 'n', target })).toBeUndefined();
    expect(shortcutAction({ ...base, key: '/', target })).toBeUndefined();
    expect(shortcutAction({ ...base, key: 'Escape', target })).toBe('escape');
    expect(shortcutAction({ ...base, key: 'Enter', ctrlKey: true, target })).toBe('submit');
    expect(shortcutAction({ ...base, key: 's', metaKey: true, target })).toBe('save');
  });

  it('ignores a plain key held with Alt', () => {
    expect(shortcutAction({ ...base, key: 'n', altKey: true })).toBeUndefined();
  });
});
