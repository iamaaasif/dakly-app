// The one error shape every API response uses. See docs/rules/errors.md.
export type ErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};
