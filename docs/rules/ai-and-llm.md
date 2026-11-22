# AI and model calls

Release 1 uses the OpenAI API (decision D17) behind the `LlmDriver` interface. The full design is in [features/04-chats-and-ai-agent.md](../features/04-chats-and-ai-agent.md). Sources: the [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses) and [structured outputs](https://platform.openai.com/docs/guides/structured-outputs) docs, the [OWASP Top 10 for LLM applications](https://genai.owasp.org/llm-top-10/), and Anthropic's [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) (simple pipelines before agents, code checks around model output).

## Rules

1. Features call `AiService` with a tier (`reply`, `fast`, `vision`, `writer`), never a model name. The tier-to-model map is config, changeable from the admin panel.
2. Only `ai/ai-runs.service.ts` calls the driver. It records every call in `ai_runs` (tier, model, prompt version, tokens, cost, duration, outcome).
3. Prompts are versioned files: `ai-agent/prompts/chat-reply.v3.ts`. Changing a prompt means a new version file and a passing eval run in the PR.
4. Structured output only, with a zod schema from `packages/contracts`. Parse the reply with zod again; retry once on a mismatch; then hand over.
5. Tools never take `storeId`, `contactId`, `conversationId`, a price or an amount as arguments. Those come from the job. A tool can only ever see this customer in this store.
   This rule is for the customer-facing agent. Ask Dakly's draft and review tools (`draft_product`, `change_products`) may take the owner's own price or amount, because nothing is saved until the owner presses Save or Apply. They still never take a store id or a product id.
6. Every number the AI sends a customer (price, stock, charge, amount) must appear in this run's tool results. Code checks this before sending; a failed check hands over.
7. Untrusted text (customer messages, comments, file contents, web pages) goes into the prompt inside a labelled data block, never as instructions.
8. No database transaction or lock is held during a model call ([database.md](database.md)).
9. Every call has a timeout (20 s for a chat reply in total) and a circuit breaker (3 errors in a minute pause AI for 2 minutes).
10. Send only what the call needs: no other customers, no tokens or credentials. Every OpenAI Responses call sets `store: false`. The Embeddings endpoint stores no application state and takes no such flag.
11. Usage is consumed through `UsageService.consume` with a reference that makes retries free.
12. Model-written content shown to shops' customers or posted publicly passes moderation first.
13. A gate that can be checked in code (AI off, window closed, saved reply matches, allowance used) runs before any model call.
14. The model never writes SQL. It reads data only through tools, so store isolation and glossary numbers hold.
15. Every tool is described for the model, not only for developers, in its contract file next to its zod schema: what it returns and when to use it instead of a similar tool; the words shop owners use for it in Bangla, Banglish and English; the unit of every number (taka, already converted from poisha; percent; count; Asia/Dhaka days); and the allowed values of every enum argument (order stages, channels). The model sees these words, so wrong ones pick the wrong report. This applies the annotation practice in Oracle's [AI enrichment guide](https://docs.oracle.com/en/database/oracle/oracle-database/26/aienb/best-practices-enriching-your-database-schema.html) to tools instead of tables.

Wrong:

```ts
const response = await openai.chat.completions.create({
  model: 'gpt-6.1-terra',
  messages: [
    { role: 'user', content: `Customer said: ${message.text}. Store id ${storeId}. Reply.` },
  ],
});
await this.chatsService.send(storeId, conversationId, response.choices[0].message.content);
```

Right:

```ts
export const salesByPeriodTool = {
  name: 'sales_by_period',
  description:
    'Total sales and order count for a period. Use for revenue questions; for one product use top_products.',
  aliases: ['বিক্রি', 'বিক্রয়', 'sale', 'sales koto', 'income', 'revenue', 'koto bikri'],
  input: salesByPeriodInputSchema, // period: 'today' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'this_month'
  output: salesByPeriodOutputSchema,
  units: { salesTaka: 'taka, converted from poisha', orders: 'count of non-cancelled orders' },
} satisfies AiToolDefinition;

const draft = await this.aiService.run({
  storeId,
  tier: 'reply',
  prompt: chatReplyPrompt.v3,
  input: buildReplyContext(context),
  tools: salesAgentTools(toolScope),
  output: chatReplyOutputSchema,
});
const checked = checkReplyFacts(draft, draft.toolResults);
if (!checked.isSafe) return this.handOver(storeId, conversationId, 'out_of_scope');
```

## Evaluation

- The golden set (200 anonymised Bangla, Banglish and English chats) runs nightly and on every prompt or model change. Wrong prices must be 0; hand-overs at least 90% correct.
- Ask Dakly AI has its own question set: at least 100 questions asked the way owners ask them, in Bangla, Banglish and English, each labelled with the tool and arguments it should pick. Correct tool choice must be at least 95%, and an answer whose numbers differ from the report must be 0.
- A PR that changes a prompt, a tool, a tool description or the tier map attaches the eval result.
