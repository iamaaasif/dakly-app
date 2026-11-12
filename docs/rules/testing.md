# Testing

Three levels. Write the cheapest one that proves the behaviour.

| Level       | File                                               | Runs against                                | Use for                                                    |
| ----------- | -------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| Unit        | `*.spec.ts` next to the code                       | Mocked repositories and drivers             | Every service rule and edge case                           |
| Integration | `*.int.spec.ts`                                    | Real Postgres (docker compose / CI service) | Every repository, every RLS policy, tricky SQL             |
| End to end  | `apps/web/e2e/` (added with the first real screen) | The running app                             | A few money paths: checkout link, payment callback, refund |

Rules:

- Test behaviour: given this input, expect this result or this error code. Do not assert that a mock was called unless the call is the behaviour (for example, a message was sent).
- One `describe` per class, test names read as sentences: `rejects a phone number the store already has`.
- Every repository has a test that store B cannot read or write store A's rows.
- Use real ids and realistic Bangla names and BD phone numbers in test data.
- No snapshot tests for API responses; assert the fields that matter.
- A bug fix starts with a failing test.

Commands: `pnpm test` (unit), `pnpm test:int` (needs `DATABASE_URL` and `DATABASE_ADMIN_URL`, see README).
