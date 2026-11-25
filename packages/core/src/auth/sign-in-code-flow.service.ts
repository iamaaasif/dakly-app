import { Inject, Injectable } from '@nestjs/common';

import type {
  RequestCodeInput,
  SignUpInput,
  VerifyCodeInput,
  RequestEmailCodeInput,
  VerifyEmailCodeInput,
} from '@dakly/contracts/auth';

import { loadEnv } from '../platform/config/env';
import { hashPassword } from '../platform/crypto/password';
import { authError } from './auth.errors';
import { AuthService } from './auth.service';
import { signInSubject, type SignInRequest } from './sign-in';
import { SignInCodes } from './sign-in-codes';
import { UsersRepository } from './users.repository';

@Injectable()
export class SignInCodeFlowService {
  constructor(
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(SignInCodes) private readonly codes: SignInCodes,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async requestCode(input: RequestCodeInput, ip: string): Promise<void> {
    if (input.purpose === 'sign_up') {
      const subject = this.signUpSubject(input);
      const existing = subject.email
        ? await this.users.findByVerifiedEmail(subject.email)
        : await this.users.findByPhone(subject.target);
      if (existing) throw authError('AUTH_ACCOUNT_EXISTS');
      return this.codes.send({ subject, purpose: 'sign_up', ip, registration: input });
    }
    const user = await this.users.findByPhone(input.phone);
    if (!user) throw authError('AUTH_ACCOUNT_NOT_FOUND');
    await this.codes.send({
      subject: signInSubject(input.phone, user.id, user.emailVerifiedAt ? user.email : null),
      purpose: input.purpose,
      ip,
    });
  }

  async verifyCode(input: VerifyCodeInput, request: SignInRequest) {
    if (input.purpose === 'sign_up') return this.verifyRegistration(input, request);
    const phone = input.phone;
    const user = await this.users.findByPhone(phone);
    const grant = await this.codes.consume(
      signInSubject(phone, user?.id, user?.emailVerifiedAt ? user.email : null),
      input.purpose,
      input.code,
      request.ip,
    );
    if (!user || grant.userId !== user.id) throw authError('AUTH_CODE_INVALID');
    return this.auth.completeSignIn(
      { id: user.id, target: phone, deliveryEmail: grant.email },
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

  private async verifyRegistration(
    input: Extract<VerifyCodeInput, { purpose: 'sign_up' }>,
    request: SignInRequest,
  ) {
    const subject = this.signUpSubject(input);
    const grant = await this.codes.consume(subject, 'sign_up', input.code, request.ip);
    if (!grant.registration || grant.email !== subject.email) throw authError('AUTH_CODE_INVALID');
    return this.auth.completeSignIn(
      {
        id: this.users.allocateId(),
        target: subject.target,
        kind: subject.email ? 'email' : undefined,
        deliveryEmail: subject.email,
        registration: {
          ...grant.registration,
          phone: subject.phone,
          email: subject.email ?? grant.registration.email,
        },
        registrationPasswordHash: input.password ? await hashPassword(input.password) : undefined,
      },
      request,
    );
  }

  private signUpSubject({ email, phone }: Pick<SignUpInput, 'email' | 'phone'>) {
    if (loadEnv().SIGNUP_CODE_CHANNEL === 'email') {
      if (!email) throw authError('AUTH_SIGNUP_EMAIL_REQUIRED');
      return { target: email, email, phone: undefined };
    }
    if (!phone) throw authError('AUTH_SIGNUP_PHONE_REQUIRED');
    return { target: phone, phone, email: undefined };
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
