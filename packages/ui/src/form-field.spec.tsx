import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from './button';
import { FormField } from './form-field';
import { Input } from './input';

afterEach(cleanup);

function CustomerForm() {
  const form = useForm({ defaultValues: { name: '' } });
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(() => undefined)}>
        <FormField name="name" label="Name" hint="As it shows on the parcel">
          {(control) => (
            <Input {...control} {...form.register('name', { required: 'Enter the name' })} />
          )}
        </FormField>
        <Button type="submit">Save customer</Button>
      </form>
    </FormProvider>
  );
}

function descriptionOf(element: HTMLElement) {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent);
}

describe('FormField', () => {
  it('labels the control and describes it with the hint', () => {
    render(<CustomerForm />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(descriptionOf(input)).toEqual(['As it shows on the parcel']);
  });

  it('shows the form error on the field and clears it once the value is valid', async () => {
    const user = userEvent.setup();
    render(<CustomerForm />);
    await user.click(screen.getByRole('button', { name: 'Save customer' }));
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Enter the name');
    expect(descriptionOf(input)).toEqual(['As it shows on the parcel', 'Enter the name']);
    await user.type(input, 'Rahima Akter');
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
