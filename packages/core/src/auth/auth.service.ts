import type { GoogleIdentity } from '@dakly/providers/google/google-identity-driver';
import { GoogleTickets } from './google-tickets';
import { hash, argon2id } from 'argon2';
import { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import { Inject, Injectable } from '@nestjs/common';
import type {
  RequestCodeInput,
  SignUpInput,
  VerifyCodeInput,
  RequestEmailCodeInput,
  VerifyEmailCodeInput,
} from '@dakly/contracts/auth';
import { SessionsService } from '../sessions/sessions.service';
import { AccountTransaction } from '../platform/database/account-transaction';
import { Clock } from '../platform/clock';
import { UsersRepository } from './users.repository';
import { SignInCodes } from './sign-in-codes';
import { SignInFailures, type SignInSubject } from './sign-in-failures';
import { passwordState } from './password-credentials';
import { authError } from './auth.errors';

export type SignInRequest = { ip: string; userAgent?: string; isRemembered: boolean };
// A pending registration is inserted in the same account transaction as its first session.
export type SignInUser = {
  id: string;
  target: string;
  kind?: 'email';
  deliveryEmail?: string;
  passwordState?: string;
  registration?: SignUpInput;
  registrationPasswordHash?: string;
  google?: {
    identity: GoogleIdentity;
    mode: 'subject' | 'link' | 'signup';
    expectedEmailVerifiedAt?: string;
  };
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(SignInCodes) private readonly codes: SignInCodes,
    @Inject(SignInFailures) private readonly failures: SignInFailures,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(AccountTransaction) private readonly transaction: AccountTransaction,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(AccountSecurityEventsService) private readonly events: AccountSecurityEventsService,
    @Inject(GoogleTickets) private readonly googleTickets: GoogleTickets,
  ) {}

  async requestCode(input: RequestCodeInput, ip: string): Promise<void> {
    const user = await this.users.findByPhone(input.phone);
    if (input.purpose === 'sign_up' && user) throw authError('AUTH_ACCOUNT_EXISTS');
    if (input.purpose === 'sign_in' && !user) throw authError('AUTH_ACCOUNT_NOT_FOUND');
    await this.codes.send(
      this.subject(input.phone, user?.id, user?.emailVerifiedAt ? user.email : null),
      input.purpose,
      ip,
      input.purpose === 'sign_up' ? input : undefined,
    );
  }

  async verifyCode(input: VerifyCodeInput, request: SignInRequest) {
    const user = await this.users.findByPhone(input.phone);
    const grant = await this.codes.consume(
      this.subject(input.phone, user?.id, user?.emailVerifiedAt ? user.email : null),
      input.purpose,
      input.code,
      request.ip,
    );
    if (input.purpose === 'sign_up') {
      if (user) throw authError('AUTH_ACCOUNT_EXISTS');
      if (!grant.registration) throw authError('AUTH_CODE_INVALID');
      return this.register(input, grant.registration, request);
    }
    if (!user || grant.userId !== user.id) throw authError('AUTH_CODE_INVALID');
    return this.completeSignIn(
      { id: user.id, target: input.phone, deliveryEmail: grant.email },
      request,
    );
  }

  async requestEmailCode(input: RequestEmailCodeInput, ip: string): Promise<void> {
    const user = await this.users.findByVerifiedEmail(input.email);
    if (!user) throw authError('AUTH_ACCOUNT_NOT_FOUND');
    await this.codes.send(
      { target: input.email, userId: user.id, email: input.email, phone: user.phone ?? undefined },
      'sign_in',
      ip,
    );
  }

  private async register(
    input: VerifyCodeInput,
    registration: SignUpInput,
    request: SignInRequest,
  ) {
    const google = input.signupTicket
      ? await this.googleTickets.read(input.signupTicket, 'signup', true)
      : undefined;
    return this.completeSignIn(
      {
        id: this.users.allocateId(),
        target: input.phone,
        registration,
        google: google ? { identity: google.identity, mode: 'signup' } : undefined,
        registrationPasswordHash: input.password
          ? await hash(input.password, { type: argon2id })
          : undefined,
      },
      request,
    );
  }

  async verifyEmailCode(input: VerifyEmailCodeInput, request: SignInRequest) {
    const user = await this.users.findByVerifiedEmail(input.email);
    const grant = await this.codes.consume(
      { target: input.email, userId: user?.id, email: user ? input.email : undefined },
      'sign_in',
      input.code,
      request.ip,
    );
    if (!user || grant.userId !== user.id || grant.email !== input.email)
      throw authError('AUTH_CODE_INVALID');
    return this.completeSignIn(
      { id: user.id, target: input.email, kind: 'email', deliveryEmail: grant.email },
      request,
    );
  }

  async completeSignIn(user: SignInUser, request: SignInRequest) {
    const subject = this.subject(user.target, user.registration ? undefined : user.id);
    await this.failures.assertAllowed(subject, request.ip);
    const result = await this.transaction.run(user.id, async () => {
      await this.createRegistration(user);
      const current = await this.users.lockForSignIn(user.id);
      if (!current)
        throw authError(user.passwordState ? 'AUTH_INVALID_CREDENTIALS' : 'AUTH_CODE_INVALID');
      this.assertIdentity(user, current);
      if (
        user.passwordState &&
        user.passwordState !== passwordState(current.id, current.passwordHash)
      )
        throw authError('AUTH_INVALID_CREDENTIALS');
      if (current.isDisabled) throw authError('AUTH_DISABLED');
      // ACC-7 replaces this refusal with the challenge; no first factor may bypass it.
      if (current.totpEnabledAt) throw authError('AUTH_SECOND_FACTOR_REQUIRED');
      await this.completeGoogleLink(user, current.googleSubject, request.ip);
      if (user.registrationPasswordHash)
        await this.events.record(user.id, {
          event: 'password.changed',
          actor: { kind: 'user' },
          ip: request.ip,
        });
      await this.users.signedIn(user.id, this.clock.now());
      return this.sessions.create(user.id, request);
    });
    await this.failures.reset(subject);
    return result;
  }

  private assertIdentity(
    user: SignInUser,
    current: {
      phone: string | null;
      email: string | null;
      emailVerifiedAt: Date | null;
      googleSubject: string | null;
    },
  ): void {
    if (user.google) {
      return this.assertGoogleIdentity(user.google, current);
    }
    const verifiedEmail = current.emailVerifiedAt ? current.email?.toLowerCase() : undefined;
    const identifier = user.kind === 'email' ? verifiedEmail : current.phone;
    if (identifier !== user.target || (user.deliveryEmail && verifiedEmail !== user.deliveryEmail))
      throw authError(user.passwordState ? 'AUTH_INVALID_CREDENTIALS' : 'AUTH_CODE_INVALID');
  }

  private async createRegistration(user: SignInUser) {
    if (!user.registration) return;
    if (
      !(await this.users.create(
        user.id,
        user.registration,
        this.clock.now(),
        user.registrationPasswordHash,
        user.google?.identity,
      ))
    )
      throw authError('AUTH_ACCOUNT_EXISTS');
  }

  private assertGoogleIdentity(
    google: NonNullable<SignInUser['google']>,
    current: { googleSubject: string | null; email: string | null; emailVerifiedAt: Date | null },
  ) {
    const { identity, mode } = google;
    if (mode !== 'link') {
      if (current.googleSubject !== identity.subject) throw authError('AUTH_INVALID_CREDENTIALS');
      return;
    }
    this.assertGoogleLink(google, current);
  }

  private assertGoogleLink(
    google: NonNullable<SignInUser['google']>,
    current: { googleSubject: string | null; email: string | null; emailVerifiedAt: Date | null },
  ) {
    if (
      google.expectedEmailVerifiedAt &&
      current.emailVerifiedAt?.toISOString() !== google.expectedEmailVerifiedAt
    )
      throw authError('AUTH_GOOGLE_TICKET_INVALID');
    if (!current.emailVerifiedAt || current.email?.toLowerCase() !== google.identity.email)
      throw authError('AUTH_INVALID_CREDENTIALS');
    if (current.googleSubject && current.googleSubject !== google.identity.subject)
      throw authError('AUTH_GOOGLE_CONFLICT');
  }

  private async completeGoogleLink(user: SignInUser, currentSubject: string | null, ip: string) {
    if (!user.google || user.google.mode === 'subject') return;
    if (user.google.mode === 'link') {
      if (currentSubject === user.google.identity.subject) return;
      if (!(await this.users.linkGoogle(user.id, user.google.identity.subject, this.clock.now())))
        throw authError('AUTH_GOOGLE_CONFLICT');
    }
    await this.events.record(user.id, { event: 'google.linked', actor: { kind: 'user' }, ip });
  }

  private subject(target: string, userId?: string, email?: string | null): SignInSubject {
    return { target, userId, phone: target, email: email?.toLowerCase() };
  }
}
