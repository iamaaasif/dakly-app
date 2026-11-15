export type ValidationField = {
  path: string;
  message: string;
};

// The one error shape every API response uses. See docs/rules/validation-and-errors.md.
export type ErrorResponse = {
  error: {
    code: string;
    message: string;
    fields?: ValidationField[];
  };
};
