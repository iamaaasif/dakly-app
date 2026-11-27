// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KeyboardShortcuts } from './keyboard-shortcuts';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

describe('KeyboardShortcuts', () => {
  it('focuses search on / and clicks the new button on n', () => {
    const onNew = vi.fn();
    render(
      <>
        <KeyboardShortcuts />
        <input type="search" aria-label="Search" />
        <button data-shortcut="new" onClick={onNew}>
          New
        </button>
      </>,
    );
    fireEvent.keyDown(document.body, { key: '/' });
    expect(document.activeElement).toBe(screen.getByLabelText('Search'));
    fireEvent.keyDown(screen.getByLabelText('Search'), { key: 'n' });
    expect(onNew).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'n' });
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('submits the form under focus with Ctrl+Enter, even while typing', () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <>
        <KeyboardShortcuts />
        <form onSubmit={onSubmit}>
          <input aria-label="Name" />
          <button type="submit">Save</button>
        </form>
      </>,
    );
    const field = screen.getByLabelText('Name');
    field.focus();
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
