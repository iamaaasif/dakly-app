import { Inject, Injectable } from '@nestjs/common';
import type { RequestCodeInput, SignUpInput, VerifyCodeInput } from '@dakly/contracts/auth';
import { SessionsService } from '../sessions/sessions.service';
import { AccountTransaction } from '../platform/database/account-transaction';
import { Clock } from '../platform/clock';
import { UsersRepository } from './users.repository';
import { SignInCodes } from './sign-in-codes';
import { SignInFailures, type SignInSubject } from './sign-in-failures';
import { authError } from './auth.errors';

export type SignInRequest = { ip: string; userAgent?: string; isRemembered: boolean };
// A pending registration is inserted in the same account transaction as its first session.
export type SignInUser = { id: string; target: string; registration?: SignUpInput };

@Injectable()
export class AuthService {
  constructor(
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(SignInCodes) private readonly codes: SignInCodes,
    @Inject(SignInFailures) private readonly failures: SignInFailures,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(AccountTransaction) private readonly transaction: AccountTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async requestCode(input: RequestCodeInput, ip: string): Promise<void> {
    const user = await this.users.findByPhone(input.phone);
    if (input.purpose === 'sign_up' && user) throw authError('AUTH_ACCOUNT_EXISTS');
    if (input.purpose === 'sign_in' && !user) throw authError('AUTH_ACCOUNT_NOT_FOUND');
    await this.codes.send(
      this.subject(input.phone, user?.id),
      input.purpose,
      ip,
      input.purpose === 'sign_up' ? input : undefined,
    );
  }

  async verifyCode(input: VerifyCodeInput, request: SignInRequest) {
    const user = await this.users.findByPhone(input.phone);
    const grant = await this.codes.consume(
      this.subject(input.phone, user?.id),
      input.purpose,
      input.code,
      request.ip,
    );
    if (input.purpose === 'sign_up') {
      if (user) throw authError('AUTH_ACCOUNT_EXISTS');
      if (!grant.registration) throw authError('AUTH_CODE_INVALID');
      return this.completeSignIn(
        { id: this.users.allocateId(), target: input.phone, registration: grant.registration },
        request,
      );
    }
    if (!user || grant.userId !== user.id) throw authError('AUTH_CODE_INVALID');
    return this.completeSignIn({ id: user.id, target: input.phone }, request);
  }

  async completeSignIn(user: SignInUser, request: SignInRequest) {
    const subject = this.subject(user.target, user.registration ? undefined : user.id);
    await this.failures.assertAllowed(subject, request.ip);
    const result = await this.transaction.run(user.id, async () => {
      if (
        user.registration &&
        !(await this.users.create(user.id, user.registration, this.clock.now()))
      )
        throw authError('AUTH_ACCOUNT_EXISTS');
      const current = await this.users.lockForSignIn(user.id);
      if (!current || current.phone !== user.target) throw authError('AUTH_CODE_INVALID');
      if (current.isDisabled) throw authError('AUTH_DISABLED');
      // ACC-7 replaces this refusal with the challenge; no first factor may bypass it.
      if (current.totpEnabledAt) throw authError('AUTH_SECOND_FACTOR_REQUIRED');
      await this.users.signedIn(user.id, this.clock.now());
      return this.sessions.create(user.id, request);
    });
    await this.failures.reset(subject);
    return result;
  }

  private subject(target: string, userId?: string): SignInSubject {
    return { target, userId, phone: target };
  }
}
