import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { QueryError } from './query-error';

afterEach(cleanup);

describe('QueryError', () => {
  it('announces the message and retries on click', async () => {
    let retries = 0;
    render(<QueryError message="Could not load plans." onRetry={() => retries++} />);
    expect(screen.getByRole('alert').textContent).toContain('Could not load plans.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(retries).toBe(1);
  });

  it('names the retry button for what it reloads', () => {
    render(<QueryError message="Failed" onRetry={() => undefined} retryLabel="Retry roles" />);
    expect(screen.getByRole('button', { name: 'Retry roles' })).toBeTruthy();
  });
});
