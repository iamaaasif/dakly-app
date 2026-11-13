# Sessions and permissions

The full flow is in [features/01-account-and-team.md](../features/01-account-and-team.md). These are the rules every route and service follows. Sources: the [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) and [Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) cheat sheets, and [Lucia's session guide](https://lucia-auth.com/sessions/overview) (opaque tokens, hashed at rest).

## Rules

1. The session is an opaque random token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. Only its SHA-256 hash is stored. No JWTs for shop sessions: they cannot be revoked when a member is removed.
2. The store, user and permissions come from the session only, through `@CurrentStore()`, `@CurrentUser()` and `request.permissions`. Never from the body, query, path or a header.
3. Every store route has `StoreGuard` and `@RequirePermission('<area>.<view|edit>')`. A test lists all routes and fails if one lacks a permission.
4. Permission checks use one pure function (`team/permissions.ts`). No `if (role === 'owner')` anywhere else.
5. Flags (`seeFullPhone`, `exportLists`, `refund`) are checked in the service, because a job or an export can reach the same data without a controller.
6. Phone masking is applied in the service response for members without `seeFullPhone`. The web app never receives the full number to hide it.
7. A 404 for another store's row looks exactly like a 404 for a missing row.
8. State-changing requests check the `Origin` header against the app's origins, on top of `SameSite=Lax`.
9. Sign-in codes, invites and password checks are rate limited per phone and per IP in Valkey.
10. Removing a member or changing their role takes effect on their next request (sessions deleted, cache cleared).
11. Admin staff sessions are separate (`staff_sessions`), on the admin hostname, and require a passkey or TOTP. A shop session never works on admin routes, and the reverse.
12. Sensitive actions (refund over the limit, connecting a payment gateway, ownership transfer) ask for a fresh code even inside a valid session.

Wrong:

```ts
@Delete(':customerId')
remove(@Req() request: StoreRequest, @Param('customerId') customerId: string) {
  if (request.user.role !== 'owner' && request.user.role !== 'admin') throw new ForbiddenException();
  return this.customersService.remove(request.body.storeId, customerId);
}
```

Right:

```ts
@Delete(':customerId')
@RequirePermission('customers.edit')
@HttpCode(204)
remove(@CurrentStore() storeId: string, @Param('customerId', ParseUUIDPipe) customerId: string) {
  return this.customersService.remove(storeId, customerId);
}
```
