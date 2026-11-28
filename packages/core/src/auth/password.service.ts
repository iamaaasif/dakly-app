import { Inject, Injectable } from '@nestjs/common';

import type {
  ChangePasswordInput,
  ConfirmPasswordResetInput,
  PasswordIdentifierInput,
  PasswordSignInInput,
} from '@dakly/contracts/auth';

import { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import { Clock } from '../platform/clock';
import { hashPassword } from '../platform/crypto/password';
import { AccountTransaction } from '../platform/database/account-transaction';
import { SessionsService } from '../sessions/sessions.service';
import { authKey } from './auth-key';
import { authError } from './auth.errors';
import { AuthService, type SignInRequest, type SignInUser } from './auth.service';
import { PasswordCredentials } from './password-credentials';
import { SignInCodes, type PasswordProof } from './sign-in-codes';
import { SignInFailures, type SignInSubject } from './sign-in-failures';
import { UsersRepository } from './users.repository';

type PasswordReplacement = {
  subject: SignInSubject;
  proof: PasswordProof;
  passwordHash: string;
  ip: string;
  revoke: boolean;
};

@Injectable()
export class PasswordService {
  constructor(
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(PasswordCredentials) private readonly credentials: PasswordCredentials,
    @Inject(SignInCodes) private readonly codes: SignInCodes,
    @Inject(SignInFailures) private readonly failures: SignInFailures,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccountTransaction) private readonly transaction: AccountTransaction,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(AccountSecurityEventsService) private readonly events: AccountSecurityEventsService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async signIn(input: PasswordSignInInput, request: SignInRequest) {
    const subject = await this.lookup(input.identifier, request.ip);
    const proof = await this.credentials.check(subject, input.password, request.ip);
    return this.auth.completeSignIn(
      { ...this.identity(subject), passwordState: proof.passwordState },
      request,
    );
  }

  async requestReset(input: PasswordIdentifierInput, ip: string): Promise<void> {
    const subject = await this.lookup(input.identifier, ip);
    const user = await this.current(subject.userId);
    await this.codes.send({ subject, purpose: 'reset_password', ip, proof: this.codeProof(user) });
  }

  async confirmReset(input: ConfirmPasswordResetInput, request: SignInRequest) {
    const subject = await this.lookup(input.identifier, request.ip);
    const proof = await this.consumeProof(subject, 'reset_password', input.code, request.ip);
    const passwordHash = await hashPassword(input.password);
    await this.replace({ subject, proof, passwordHash, ip: request.ip, revoke: true });
    return this.auth.completeSignIn(
      {
        ...this.identity(subject),
        passwordState: this.credentials.proof(subject.userId!, passwordHash).passwordState,
      },
      request,
    );
  }

  async requestChangeProof(userId: string, ip: string): Promise<void> {
    const user = await this.current(userId);
    const subject = this.changeSubject(user);
    await this.codes.send({
      subject,
      purpose: 'password_change_proof',
      ip,
      proof: this.codeProof(user),
    });
  }

  async change(userId: string, input: ChangePasswordInput, ip: string): Promise<void> {
    const user = await this.current(userId);
    const subject = this.changeSubject(user);
    const proof =
      'currentPassword' in input
        ? await this.credentials.check(subject, input.currentPassword, ip)
        : await this.consumeProof(subject, 'password_change_proof', input.proofCode, ip);
    const passwordHash = await hashPassword(input.password);
    await this.replace({ subject, proof, passwordHash, ip, revoke: false });
  }

  private async replace({
    subject,
    proof,
    passwordHash,
    ip,
    revoke,
  }: PasswordReplacement): Promise<void> {
    await this.transaction.run(subject.userId!, async () => {
      const current = await this.current(subject.userId);
      this.credentials.assertCurrent(current.id, current.passwordHash, proof);
      if (proof.identifierState && proof.identifierState !== this.identifierState(current))
        throw authError('AUTH_PROOF_REQUIRED');
      this.assertIdentity(subject, current);
      await this.users.changePassword(current.id, passwordHash, this.clock.now());
      if (revoke) await this.sessions.revokeAll(current.id, ip);
      await this.events.record(current.id, {
        event: 'password.changed',
        actor: { kind: 'user' },
        ip,
      });
    });
  }

  private assertIdentity(
    subject: SignInSubject,
    current: Awaited<ReturnType<PasswordService['current']>>,
  ): void {
    const verifiedEmail = current.emailVerifiedAt ? current.email?.toLowerCase() : undefined;
    const target = subject.target.includes('@') ? verifiedEmail : current.phone;
    if (target !== subject.target || (subject.email && verifiedEmail !== subject.email))
      throw authError('AUTH_PROOF_REQUIRED');
  }

  private async consumeProof(
    subject: SignInSubject,
    purpose: 'reset_password' | 'password_change_proof',
    code: string,
    ip: string,
  ): Promise<PasswordProof> {
    const grant = await this.codes.consume(subject, purpose, code, ip);
    if (
      grant.userId !== subject.userId ||
      grant.email !== subject.email ||
      !grant.proof ||
      !('passwordState' in grant.proof)
    )
      throw authError('AUTH_PROOF_REQUIRED');
    return grant.proof;
  }

  private async lookup(identifier: string, ip: string): Promise<SignInSubject> {
    await this.failures.assertAllowed({ target: identifier }, ip);
    const user = identifier.includes('@')
      ? await this.users.findByVerifiedEmail(identifier)
      : await this.users.findByPhone(identifier);
    if (!user && (await this.users.hasUnverifiedEmail(identifier))) {
      await this.failures.recordFailure({ target: identifier }, ip);
      throw authError('AUTH_EMAIL_UNVERIFIED');
    }
    return {
      target: identifier,
      userId: user?.id,
      phone: user?.phone ?? undefined,
      email: user?.emailVerifiedAt ? user.email?.toLowerCase() : undefined,
    };
  }

  private async current(userId?: string) {
    if (!userId) throw authError('AUTH_INVALID_CREDENTIALS');
    const user = await this.users.lockForSignIn(userId);
    if (!user) throw authError('AUTH_INVALID_CREDENTIALS');
    if (user.isDisabled) throw authError('AUTH_DISABLED');
    return user;
  }

  private codeProof(user: Awaited<ReturnType<PasswordService['current']>>): PasswordProof {
    return {
      ...this.credentials.proof(user.id, user.passwordHash),
      identifierState: this.identifierState(user),
    };
  }

  private identifierState(user: Awaited<ReturnType<PasswordService['current']>>): string {
    return authKey(
      'password-code-identity',
      JSON.stringify([user.id, user.phone, user.phoneVerifiedAt, user.email, user.emailVerifiedAt]),
    );
  }

  private identity(subject: SignInSubject): SignInUser {
    return {
      id: subject.userId!,
      target: subject.target,
      kind: subject.target.includes('@') ? 'email' : undefined,
      deliveryEmail: subject.email,
    };
  }

  private changeSubject(user: Awaited<ReturnType<PasswordService['current']>>): SignInSubject {
    const email = user.emailVerifiedAt ? user.email?.toLowerCase() : undefined;
    const phone = user.phoneVerifiedAt ? (user.phone ?? undefined) : undefined;
    const target = phone ?? email;
    if (!target) throw authError('AUTH_PROOF_REQUIRED');
    return { target, userId: user.id, phone, email, binding: user.id };
  }
}
