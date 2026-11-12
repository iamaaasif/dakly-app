## What and why

<!-- One or two sentences. Link the PRD section or issue. -->

## How to test

<!-- Steps or the tests that cover it. -->

## Checklist

- [ ] I read every line of this diff, including AI-written code, and removed anything this change does not need.
- [ ] `pnpm check` passes locally.
- [ ] Business rules are in services; controllers, jobs and repositories stay thin.
- [ ] No import of another feature's repository, job or internal file.
- [ ] New tables with shop data have `store_id`, an RLS policy and a cross-store test.
- [ ] Input is parsed with a zod schema from `packages/contracts`.
- [ ] Errors use `AppError` codes; no secrets, tokens, phone numbers or message text in logs.
- [ ] Under about 500 changed lines, one purpose.
