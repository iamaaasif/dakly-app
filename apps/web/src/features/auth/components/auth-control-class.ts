// Sign-in and sign-up fields and primary buttons are taller and rounder than the app default.
// The radius and size are important because the shared Input and Button set their own, and
// tailwind-merge would otherwise read the custom size as a text colour and drop the colour.
export const authFieldClass = 'min-h-11.5 rounded-control! px-3.5 text-field!';
// The design uses the brand orange fill here, not the darker action fill.
export const authButtonClass =
  'min-h-12 w-full rounded-control! bg-primary! text-field! font-semibold hover:bg-action!';
