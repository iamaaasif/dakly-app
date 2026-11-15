import { Inject, Injectable } from '@nestjs/common';

import type {
  RequestCodeInput,
  SignUpInput,
  VerifyCodeInput,
  RequestEmailCodeInput,
  VerifyEmailCodeInput,
} from '@dakly/contracts/auth';

import { hashPassword } from '../platform/crypto/password';
import { authError } from './auth.errors';
import { AuthService } from './auth.service';
import { GoogleTickets } from './google-tickets';
import { signInSubject, type SignInRequest } from './sign-in';
import { SignInCodes } from './sign-in-codes';
import { UsersRepository } from './users.repository';

@Injectable()
export class SignInCodeFlowService {
  constructor(
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(SignInCodes) private readonly codes: SignInCodes,
    @Inject(GoogleTickets) private readonly googleTickets: GoogleTickets,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async requestCode(input: RequestCodeInput, ip: string): Promise<void> {
    const user = await this.users.findByPhone(input.phone);
    if (input.purpose === 'sign_up' && user) throw authError('AUTH_ACCOUNT_EXISTS');
    if (input.purpose === 'sign_in' && !user) throw authError('AUTH_ACCOUNT_NOT_FOUND');
    await this.codes.send({
      subject: signInSubject(input.phone, user?.id, user?.emailVerifiedAt ? user.email : null),
      purpose: input.purpose,
      ip,
      registration: input.purpose === 'sign_up' ? input : undefined,
    });
  }

  async verifyCode(input: VerifyCodeInput, request: SignInRequest) {
    const user = await this.users.findByPhone(input.phone);
    const grant = await this.codes.consume(
      signInSubject(input.phone, user?.id, user?.emailVerifiedAt ? user.email : null),
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
    return this.auth.completeSignIn(
      { id: user.id, target: input.phone, deliveryEmail: grant.email },
      request,
    );
  }

  async requestEmailCode(input: RequestEmailCodeInput, ip: string): Promise<void> {
    const user = await this.users.findByVerifiedEmail(input.email);
    if (!user) throw authError('AUTH_ACCOUNT_NOT_FOUND');
    await this.codes.send({
      subject: {
        target: input.email,
        userId: user.id,
        email: input.email,
        phone: user.phone ?? undefined,
      },
      purpose: 'sign_in',
      ip,
    });
  }

  private async register(
    input: VerifyCodeInput,
    registration: SignUpInput,
    request: SignInRequest,
  ) {
    const google = input.signupTicket
      ? await this.googleTickets.read(input.signupTicket, 'signup', true)
      : undefined;
    return this.auth.completeSignIn(
      {
        id: this.users.allocateId(),
        target: input.phone,
        registration,
        google: google ? { identity: google.identity, mode: 'signup' } : undefined,
        registrationPasswordHash: input.password ? await hashPassword(input.password) : undefined,
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
    return this.auth.completeSignIn(
      { id: user.id, target: input.email, kind: 'email', deliveryEmail: grant.email },
      request,
    );
  }
}
