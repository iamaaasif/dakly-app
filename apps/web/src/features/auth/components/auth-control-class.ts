// Sign-in and sign-up fields and primary buttons are taller and rounder than the app default.
// The radius and size are important because the shared Input and Button set their own, and
// tailwind-merge would otherwise read the custom size as a text colour and drop the colour.
export const authFieldClass = 'min-h-11.5 rounded-control! px-3.5 text-field!';
<<<<<<< origin/main
// The design uses the brand orange fill here, not the darker action fill.
export const authButtonClass =
  'min-h-12 w-full rounded-control! bg-primary! text-field! font-semibold hover:bg-action!';
=======
export const authPrefixedFieldClass = 'min-h-11.5 rounded-r-control! px-3.5 text-field!';
// The design uses the brand orange fill here, not the darker action fill.
export const authButtonClass =
  'min-h-12 w-full rounded-control! bg-primary! text-field! font-semibold hover:bg-action!';
// The Google and Facebook buttons: 46 px, light border, centred icon and label.
export const authSocialClass =
  'flex min-h-11.5 w-full items-center justify-center gap-2.5 rounded-control border border-border-strong bg-surface text-base font-semibold text-text';
>>>>>>> pr567
