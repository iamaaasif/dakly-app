// One rule for "save from the keyboard": only a form that could be submitted by its own button.
export function submitFormFromKeyboard(form: HTMLFormElement | null | undefined): boolean {
  const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!form || !submit || submit.disabled) return false;
  form.requestSubmit();
  return true;
}
