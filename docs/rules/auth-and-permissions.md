# Sessions and permissions

The full flow is in [features/01-account-and-team.md](../features/01-account-and-team.md). These are the rules every route and service follows. Sources: the [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) and [Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) cheat sheets, and [Lucia's session guide](https://lucia-auth.com/sessions/overview) (opaque tokens, hashed at rest).

## Rules

1. The session is an opaque random token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. Only its SHA-256 hash is stored. No JWTs for shop sessions: they cannot be revoked when a member is removed.
2. The store, user and permissions come from the session only, through `@CurrentStore()`, `@CurrentUser()`, `@CurrentAccess()` and `@CurrentSession()`. Never from the body, query, path or a header.
3. `StoreGuard` runs globally. A route becomes a store route through `@RequirePermission('<area>.<view|edit>')`, or `@AnyMember()` for access shared by all active members; the guard then rejects it without an active store. Controllers do not add `@UseGuards(StoreGuard)`. Staff routes declare `@StaffAccess()` or `@StaffAccess(false)` for enrollment and sign-in that still require Access. Other routes declare `@RequireUser()` or `@Public()`. A test lists all routes and fails if one lacks its access rule.
4. Permission checks use one pure function (`team/permissions.ts`). No `if (role === 'owner')` anywhere else.
5. Flags (`seeFullPhone`, `exportLists`, `refund`) are checked in the service, because a job or an export can reach the same data without a controller.
6. Customer and team contact phone numbers are masked in the service response for members without `seeFullPhone`; the web app never receives those full numbers to hide them. Reads of the user's own account contact details are governed by account access, and reads of the store's business contact details by `storeSettings` access. Printable order invoices may include the shop name and phone with Orders view access. Shipping labels require Orders view and See full phone numbers. The customer privacy flag does not restrict these own-account or business contact reads.
7. A 404 for another store's row looks exactly like a 404 for a missing row.
8. State-changing browser requests check the `Origin` header against the app's origins, on top of `SameSite=Lax`; missing origins are rejected. Only signed provider callbacks marked `@ProviderCallback()` skip the origin check and must verify their provider signature.
9. Sign-in codes, invites and password checks are rate limited per phone and per IP in Valkey.
10. Every request reads its session and current membership and role from the primary PostgreSQL database. Session and permission results are not cached across requests. A removal, role change or session revocation takes effect on requests whose checks start after it commits; already authorised requests may finish. If the database check fails, reject access. A removed membership blocks only that store; revoking a session blocks both account and store routes.
11. Admin staff sessions are separate (`staff_sessions`), on the admin hostname, and require a passkey or TOTP. A shop session never works on admin routes, and the reverse.
12. Sensitive actions (refund over the limit, connecting a payment gateway, ownership transfer) ask for a fresh code even inside a valid session.

Wrong:

```ts
@Delete(':contactId')
remove(@Req() request: StoreRequest, @Param('contactId') contactId: string) {
  if (request.user.role !== 'owner' && request.user.role !== 'admin') throw new ForbiddenException();
  return this.contactsService.remove(request.body.storeId, contactId);
}
```

Right:

```ts
@Delete(':contactId')
@RequirePermission('customers.edit')
@HttpCode(204)
remove(@CurrentStore() storeId: string, @Param('contactId', ParseUUIDPipe) contactId: string) {
  return this.contactsService.remove(storeId, contactId);
}
```
