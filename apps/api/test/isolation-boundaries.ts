// These exact routes cross an account or staff boundary instead of the active shop boundary.
// Keep the owning integration proof beside each group; a newly registered route is never ignored.
const groups = [
  {
    evidence: 'channels/meta-webhooks.int.spec.ts',
    boundary: 'public Meta verification and signed intake before store routing',
    routes: ['GET /webhooks/meta', 'POST /webhooks/meta'],
  },
  {
    evidence: 'payments/payments.int.spec.ts',
    boundary: 'public callback intake with merchant signature verification in the worker',
    routes: ['POST /webhooks/payments/:gateway'],
  },
  {
    evidence:
      'sessions/sessions-http.int.spec.ts; stores/stores.int.spec.ts; team/members.int.spec.ts; admin/staff-recovery.int.spec.ts',
    boundary: 'account membership, token recipient, or new-store creation',
    routes: [
      'GET /me',
      'GET /me/context',
      'GET /me/stores',
      'POST /me/active-store',
      'GET /me/sessions',
      'DELETE /me/sessions/:sessionId',
      'POST /me/sessions/sign-out-others',
      'POST /me/sessions/sign-out-all',
      'POST /auth/sign-out',
      'POST /stores',
      'POST /invites/accept',
      'GET /me/security-history',
    ],
  },
  {
    evidence:
      'auth/auth-http.int.spec.ts; auth/password-auth.int.spec.ts; auth/totp-auth.int.spec.ts; auth/google-auth.int.spec.ts',
    boundary: 'public authentication or authenticated account security',
    routes: [
      'POST /auth/code',
      'POST /auth/code/verify',
      'POST /auth/email/code',
      'POST /auth/email/code/verify',
      'POST /auth/password',
      'POST /auth/password-reset',
      'POST /auth/password-reset/confirm',
      'POST /auth/google',
      'POST /auth/google/email/verify',
      'POST /auth/totp',
      'POST /auth/totp/recovery/code',
      'POST /auth/totp/recovery',
      'POST /auth/totp/recovery/cancel',
      'POST /auth/totp/recovery/complete',
      'POST /me/email/proof',
      'POST /me/email',
      'POST /me/email/verify',
      'POST /me/password/proof',
      'POST /me/password',
      'POST /me/totp/proof',
      'POST /me/totp/setup',
      'POST /me/totp/confirm',
      'POST /me/totp/disable',
    ],
  },
  {
    evidence: 'admin/staff-auth.int.spec.ts; admin/staff-proxy.int.spec.ts',
    boundary: 'Cloudflare Access and separate staff authentication',
    routes: [
      'POST /admin/auth/sign-in',
      'POST /admin/auth/enroll',
      'POST /admin/auth/totp',
      'POST /admin/auth/passkey/register',
      'POST /admin/auth/passkey/authenticate',
      'GET /admin/auth/session',
      'POST /admin/auth/sign-out',
    ],
  },
  {
    evidence:
      'admin/support.int.spec.ts; admin/staff-history.spec.ts; admin/staff-seal.int.spec.ts; admin/staff-recovery.int.spec.ts',
    boundary: 'approved staff cross-store metadata, audited recovery and break-glass operations',
    routes: [
      'GET /admin/support/targets',
      'GET /admin/support',
      'POST /admin/support',
      'POST /admin/support/:id/handoff',
      'POST /admin/support/break-glass/preview',
      'POST /admin/support/break-glass',
      'GET /admin/audit',
      'POST /admin/audit/exports',
      'GET /admin/audit/exports/:id',
      'GET /admin/audit/exports/:id/download',
      'GET /admin/audit/verify',
      'GET /admin/alerts',
      'POST /admin/alerts/:id/retry',
      'POST /admin/account-recovery/lookup',
      'POST /admin/account-recovery/preview',
      'POST /admin/account-recovery/code',
      'POST /admin/account-recovery',
    ],
  },
  {
    evidence: 'admin/wallet-credit.int.spec.ts',
    boundary: 'confirmed and audited staff wallet credit for the store named in the path',
    routes: [
      'POST /admin/stores/:storeId/wallet-credits/preview',
      'POST /admin/stores/:storeId/wallet-credits',
    ],
  },
  {
    evidence: 'admin/shops.int.spec.ts',
    boundary:
      'staff shop list and detail through metadata-only definer functions, with the view audited',
    routes: ['GET /admin/stores', 'GET /admin/stores/:storeId'],
  },
  {
    evidence: 'admin/sms-sender-review.int.spec.ts',
    boundary: 'staff review of sender requests: definer-function queue and audited decisions',
    routes: [
      'GET /admin/sms-sender-ids',
      'POST /admin/stores/:storeId/sms-sender-ids/:smsSenderIdId/:decision',
    ],
  },
  {
    evidence: 'admin/kill-switches.int.spec.ts',
    boundary:
      'audited staff kill switches: global control rows, or the store named in the path with a conflict check',
    routes: [
      'GET /admin/kill-switches',
      'PUT /admin/kill-switches/:feature',
      'PUT /admin/stores/:storeId/kill-switches/:feature',
    ],
  },
  {
    evidence: 'route-access.int.spec.ts; stores/stores.int.spec.ts; admin/support.int.spec.ts',
    boundary: 'public health/catalogue or one-use support handoff (no shop session)',
    routes: ['GET /health', 'GET /plans', 'POST /support/exchange'],
  },
  {
    evidence: 'links/links.int.spec.ts',
    boundary: 'public tracked link and SMS opt-out page; the store comes from the link code',
    routes: ['GET /l/:code', 'GET /l/s/:code', 'POST /l/s/:code'],
  },
  {
    evidence: 'orders/order-confirmation.int.spec.ts',
    boundary: 'public order confirm page; the store comes from the hashed token, never the request',
    routes: ['GET /l/c/:token', 'POST /l/c/:token'],
  },
];
export const isolationBoundaries = new Map(
  groups.flatMap(({ routes, ...reason }) => routes.map((route) => [route, reason] as const)),
);
