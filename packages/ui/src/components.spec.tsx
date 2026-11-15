import { createRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';
import { Input } from './input';
import { Card } from './card';
import { Badge } from './badge';
import { Skeleton } from './skeleton';

afterEach(cleanup);

describe('base components', () => {
  it('submits a labelled form by keyboard and forwards native refs and attributes', async () => {
    const user = userEvent.setup();
    const inputRef = createRef<HTMLInputElement>();
    const buttonRef = createRef<HTMLButtonElement>();
    let submitted = '';
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitted = inputRef.current?.value ?? '';
        }}
      >
        <label htmlFor="name">Name</label>
        <Input id="name" name="name" ref={inputRef} required aria-describedby="hint" />
        <p id="hint">Use the customer name</p>
        <Button ref={buttonRef} type="submit">
          Save customer
        </Button>
      </form>,
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }));
    expect(inputRef.current?.getAttribute('aria-describedby')).toBe('hint');
    await user.keyboard('Rahima');
    await user.tab();
    expect(document.activeElement).toBe(buttonRef.current);
    await user.keyboard('{Enter}');
    expect(submitted).toBe('Rahima');
  });

  it('keeps a loading button named and prevents repeated activation', async () => {
    const user = userEvent.setup();
    let activations = 0;
    const { rerender } = render(
      <Button loading onClick={() => activations++}>
        Save customer
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save customer' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(true);
    await user.click(button);
    expect(activations).toBe(0);
    rerender(
      <Button disabled onClick={() => activations++}>
        Save customer
      </Button>,
    );
    await user.click(button);
    expect(activations).toBe(0);
    rerender(<Button onClick={() => activations++}>Save customer</Button>);
    await user.click(button);
    expect(activations).toBe(1);
  });

  it('keeps invalid fields associated with their error and disables editing', async () => {
    const user = userEvent.setup();
    render(
      <>
        <label htmlFor="phone">Phone</label>
        <Input
          id="phone"
          aria-invalid
          aria-describedby="error"
          disabled
          defaultValue="01712345678"
        />
        <p id="error" role="alert">
          Check the phone number
        </p>
      </>,
    );
    const input = screen.getByRole('textbox', { name: 'Phone' });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
    await user.type(input, '1');
    expect((input as HTMLInputElement).value).toBe('01712345678');
  });

  it('composes readable card content and status text while hiding decorative skeletons', () => {
    render(
      <Card role="region" aria-labelledby="title">
        <h2 id="title">Customer</h2>
        <Badge variant="success">Saved</Badge>
        <div role="status">
          Loading customer
          <Skeleton data-testid="placeholder" />
        </div>
      </Card>,
    );
    expect(screen.getByRole('region', { name: 'Customer' }).textContent).toContain('Saved');
    expect(screen.getByRole('status').textContent).toBe('Loading customer');
    expect(screen.getByTestId('placeholder').getAttribute('aria-hidden')).toBe('true');
  });
});
