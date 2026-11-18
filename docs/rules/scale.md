# Scale

Release 1 runs on a small stack, but the code must not need a rewrite when Dakly grows (see [scale-and-security.md](../scale-and-security.md)). These rules cost little now and are expensive to add later.

## Rules

1. Every list endpoint uses cursor pagination with a server limit of 100 rows. No page numbers, no "return everything".
2. Every query filters by `storeId` first, and every index starts with `store_id`. Only approved admin and billing jobs read across stores, through the functions in [multi-tenancy.md](multi-tenancy.md).
3. Bulk actions run as jobs with progress, never inside a request ([jobs.md](jobs.md)).
4. A campaign sends to a snapshot of its audience taken at send time.
5. Large segment counts are kept up to date from events, with a nightly full rebuild.
6. Customer imports are capped at 10 MB and 50,000 rows and read whole; the size is enforced in the signed upload URL and again when the job reads the file. Raise the cap only together with a streaming reader.
7. Each store has fair-use limits on API calls, exports and AI usage, so one store cannot slow the others.
8. Counters shown in the app (unread chats, usage meters) come from stored totals, not `COUNT(*)` on large tables.
9. Time is stored in UTC (`timestamptz`) and shown in the store's time zone.
10. Dashboard and analytics numbers are read from the metrics service and its daily tables, never computed from raw messages on page load.

## Performance budgets

| What                                     | Target (p95)                            |
| ---------------------------------------- | --------------------------------------- |
| API read                                 | under 300 ms                            |
| API write                                | under 500 ms                            |
| Webhook intake answer                    | under 100 ms                            |
| New chat message visible in the inbox    | under 2 s                               |
| AI reply sent after the customer message | under 8 s (p50 under 4 s)               |
| Customer search on 1 million customers   | under 1 s                               |
| Segment count preview                    | under 3 s                               |
| Dashboard and analytics numbers          | under 1 s, data no older than 5 minutes |
| Page usable on a mid-range Android on 4G | under 2.5 s (p75)                       |

A PR that adds a query on a table that can pass a million rows says which index it uses.

## Wrong

```ts
// Counts the whole table on every page load, and returns every row.
async listChats(storeId: StoreId) {
  const unread = await this.chatsRepository.countUnread(storeId);
  const chats = await this.chatsRepository.findAll(storeId);
  return { unread, chats };
}
```

## Right

```ts
async listChats(storeId: StoreId, page: CursorPage) {
  const [unread, chats] = await Promise.all([
    this.chatCountersRepository.getUnread(storeId),
    this.chatsRepository.listByLastMessage(storeId, page),
  ]);
  return { unread, chats };
}
```
