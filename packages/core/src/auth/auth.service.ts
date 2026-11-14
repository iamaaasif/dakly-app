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
      return this.completeSignIn(
        {
          id: this.users.allocateId(),
          target: input.phone,
          registration: grant.registration,
          registrationPasswordHash: input.password
            ? await hash(input.password, { type: argon2id })
            : undefined,
        },
        request,
      );
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
      if (
        user.registration &&
        !(await this.users.create(
          user.id,
          user.registration,
          this.clock.now(),
          user.registrationPasswordHash,
        ))
      )
        throw authError('AUTH_ACCOUNT_EXISTS');
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
    current: { phone: string | null; email: string | null; emailVerifiedAt: Date | null },
  ): void {
    const verifiedEmail = current.emailVerifiedAt ? current.email?.toLowerCase() : undefined;
    const identifier = user.kind === 'email' ? verifiedEmail : current.phone;
    if (identifier !== user.target || (user.deliveryEmail && verifiedEmail !== user.deliveryEmail))
      throw authError(user.passwordState ? 'AUTH_INVALID_CREDENTIALS' : 'AUTH_CODE_INVALID');
  }

  private subject(target: string, userId?: string, email?: string | null): SignInSubject {
    return { target, userId, phone: target, email: email?.toLowerCase() };
  }
}
