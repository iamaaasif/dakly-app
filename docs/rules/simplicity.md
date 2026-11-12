# Simplicity, and signs of AI-written code

Write the plainest code that solves today's problem. A new teammate should understand any file in five minutes.

Sources this rule follows:

- [Google engineering practices](https://google.github.io/eng-practices/review/reviewer/looking-for.html): reject over-engineering; solve the problem you have now.
- [Kent Beck's rules of simple design](https://martinfowler.com/bliki/BeckDesignRules.html): passes tests, reveals intention, no duplication, fewest elements.
- [YAGNI](https://martinfowler.com/bliki/Yagni.html) and [The Wrong Abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction): duplication is cheaper than the wrong abstraction.
- [The Grug Brained Developer](https://grugbrain.dev/): complexity is the enemy.

## Signs to remove before you open a PR

AI tools are welcome. Their output is a first draft that you trim.

| Sign                                                        | Do instead                                   |
| ----------------------------------------------------------- | -------------------------------------------- |
| A comment on every line, JSDoc on obvious functions         | Comment only the why                         |
| try/catch that logs and rethrows                            | Let it throw; the filter handles it          |
| Null checks on values the types guarantee                   | Trust types after zod parsing at the edge    |
| Interface + factory + base class for one implementation     | One concrete class (vendor drivers excepted) |
| Options nobody passes (`{ retries, strategy, verbose }`)    | Only parameters a caller uses today          |
| A new helper that already exists in `packages/`             | Search first, reuse                          |
| Long filler names (`EnhancedOrderProcessingManager`)        | `OrdersService`                              |
| Deep nesting, chained ternaries, clever `reduce` one-liners | Early returns and a plain loop               |
| `any`, `as unknown as`, `@ts-ignore`                        | Fix the type                                 |
| `console.log`, leftover TODOs                               | Nest `Logger`; TODO with an issue link       |
| Tests that only check mocks were called                     | Test the result                              |
| A 1,500-line PR from one prompt                             | Split it; read every line                    |

## Limits enforced by lint

`complexity` ≤ 10, `sonarjs/cognitive-complexity` ≤ 15, `max-depth` ≤ 3, functions ≤ 60 lines, files ≤ 400 lines, no nested ternaries, no `any`, no `console`, no TypeScript `enum`, no barrel imports. `pnpm lint:unused` (Knip) finds dead code; `pnpm lint:duplicates` (jscpd) finds copy-paste.

If you hit a limit, split the function. Do not raise the limit or add a disable comment without a reviewer agreeing in the PR.
