# Forms

Every form uses React Hook Form with the zod schema from `@dakly/contracts`, the same schema the API validates with. Sources: the [React Hook Form docs](https://react-hook-form.com/docs) and the [shadcn/ui form pattern](https://ui.shadcn.com/docs/components/form).

## Rules

1. The schema comes from contracts. A form never defines its own copy of an API rule (phone format, required fields, max lengths).
2. If the form needs a field the API does not take (confirm password), extend the contract schema in the feature: `createCustomerSchema.extend({ ... })`.
3. Inputs use the `packages/ui` field components, which wire the label, the input, the hint and the error message with the right ARIA attributes.
4. Validate on submit first, then on change for fields that already showed an error (`mode: 'onSubmit'`, `reValidateMode: 'onChange'`).
5. Server errors map back to fields where the code says which field (`CUSTOMER_PHONE_TAKEN` → `phone`). Others show above the submit button.
6. The submit button shows a pending state and is disabled while the request runs, so a double tap does not send twice. Money-moving actions also send an idempotency key.
7. Money inputs take Taka from the person and convert to poisha once, in the form's submit handler: `toPoisha(values.price)`. Never send a float to the API.
8. Phone inputs show `+880`, accept `01712345678`, `1712345678`, `+8801712345678` and Bangla digits, and let the contract schema normalise.
9. Destructive actions (delete, cancel order, refund) need a confirm dialog that names the thing: "Cancel order #1042?".
10. Long forms (campaign builder, product with variants) save a draft on the server, not in local storage.

Wrong:

```tsx
const [phone, setPhone] = useState('');
const [error, setError] = useState('');
function submit() {
  if (!/^01\d{9}$/.test(phone)) return setError('Invalid phone');
  fetch('/api/customers', { method: 'POST', body: JSON.stringify({ phone }) });
}
```

Right:

```tsx
const form = useForm<CreateCustomerInput>({
  resolver: zodResolver(createCustomerSchema),
  defaultValues: { name: '', phone: '' },
});
const createCustomer = useCreateCustomer();

<Form form={form} onSubmit={(values) => createCustomer.mutate(values)}>
  <TextField name="name" label="Name" />
  <PhoneField name="phone" label="Mobile number" />
  <Button type="submit" isPending={createCustomer.isPending}>
    Save customer
  </Button>
</Form>;
```

## Copy

Labels are nouns ("Mobile number"), buttons are verbs that say what happens ("Save customer", "Send 103 messages"). Error messages say what to do: "Enter an 11-digit mobile number starting with 01", not "Invalid input".
