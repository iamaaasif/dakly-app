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

Commands: `pnpm test` (unit), `pnpm test:int` (needs `DATABASE_URL` and `DATABASE_ADMIN_URL`, see README), and `pnpm test:e2e` ([browser setup](../development/browser-tests.md)).

Each `pnpm test:int` run sets `QUEUE_PREFIX` to a prefix of its own and removes its keys at the end. A test that needs an empty queue uses `` `${loadEnv().QUEUE_PREFIX}-${randomUUID()}` `` as its BullMQ prefix, so its queue goes too.

## Store route isolation

`apps/api/test/cross-store.int.spec.ts` boots the production API module with its full guard chain.
Its Fastify route inventory requires an executable fixture for every shop route; account,
public and staff routes have exact entries with their owning boundary tests in
`isolation-boundaries.ts`. Generated HEAD routes share the GET fixture only when Fastify
uses the identical handler and its HEAD response hook. A separate HEAD handler needs a fixture.

Each tenant fixture proves a successful authorized action before testing foreign ids against
missing ids, nonempty lists in both shops, and unchanged foreign rows after writes. Ownership
acceptance uses the named recipient; support reads and writes use approved grants. Authorization
errors are separate checks and never prove tenant isolation. Routes without a resource id prove
that the session chooses the store for reads and writes.

The API uses `dakly_app` with RLS. Direct reads without store predicates prove the policies;
a disposable relation proves the assertions reject both extra foreign rows and missing own rows.
Each feature's `owner-filters.int.spec.ts` separately uses `DATABASE_ADMIN_URL` to test repository
predicates without RLS assistance. Only fixture rows are cleaned up. CI runs both through the
existing `pnpm test:int` command.
