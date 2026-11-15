import { Inject, Injectable } from '@nestjs/common';

import type {
  ChangeEmailInput,
  RequestEmailCodeInput,
  VerifyNewEmailInput,
} from '@dakly/contracts/auth';

import { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import { Clock } from '../platform/clock';
import { AccountTransaction } from '../platform/database/account-transaction';
import { authError } from './auth.errors';
import { PasswordCredentials } from './password-credentials';
import { SignInCodes, type PhoneProof, type FreshProof } from './sign-in-codes';
import { UsersRepository } from './users.repository';

@Injectable()
export class EmailChangeService {
  constructor(
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(SignInCodes) private readonly codes: SignInCodes,
    @Inject(AccountTransaction) private readonly transaction: AccountTransaction,
    @Inject(AccountSecurityEventsService) private readonly events: AccountSecurityEventsService,
    @Inject(PasswordCredentials) private readonly passwords: PasswordCredentials,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async requestProof(userId: string, input: RequestEmailCodeInput, ip: string): Promise<void> {
    const proof = await this.phoneProof(userId);
    // This action proves control of the existing phone, even when sign-in prefers email.
    await this.codes.send({
      subject: this.proofSubject(userId, input.email, proof.phone),
      purpose: 'email_change_proof',
      ip,
      proof,
    });
  }

  async requestChange(userId: string, input: ChangeEmailInput, ip: string): Promise<void> {
    const proof =
      'currentPassword' in input
        ? await this.passwords.check({ target: userId, userId }, input.currentPassword, ip)
        : await this.consumePhoneProof(userId, input.email, input.proofCode, ip);
    await this.codes.send({
      subject: { target: input.email, email: input.email, userId, binding: userId },
      purpose: 'add_email',
      ip,
      proof,
    });
  }

  async verifyChange(userId: string, input: VerifyNewEmailInput, ip: string): Promise<void> {
    const grant = await this.codes.consume(
      { target: input.email, userId, binding: userId },
      'add_email',
      input.code,
      ip,
    );
    if (grant.userId !== userId || !grant.proof) throw authError('AUTH_PROOF_REQUIRED');
    const proof = grant.proof;
    await this.transaction.run(userId, async () => {
      await this.assertProof(userId, proof);
      if (!(await this.users.changeEmail(userId, input.email, this.clock.now())))
        throw authError('AUTH_EMAIL_TAKEN');
      await this.events.record(userId, { event: 'email.changed', actor: { kind: 'user' }, ip });
    });
  }

  private async assertProof(userId: string, proof: FreshProof): Promise<void> {
    if ('passwordState' in proof) {
      const current = await this.users.lockForSignIn(userId);
      if (!current || current.isDisabled) throw authError('AUTH_PROOF_REQUIRED');
      this.passwords.assertCurrent(userId, current.passwordHash, proof);
    } else {
      const current = await this.phoneProof(userId);
      if (!this.matchesProof(current, proof)) throw authError('AUTH_PROOF_REQUIRED');
    }
  }

  private async consumePhoneProof(
    userId: string,
    email: string,
    code: string,
    ip: string,
  ): Promise<PhoneProof> {
    const current = await this.phoneProof(userId);
    const grant = await this.codes.consume(
      this.proofSubject(userId, email, current.phone),
      'email_change_proof',
      code,
      ip,
    );
    if (
      grant.userId !== userId ||
      !grant.proof ||
      !('phone' in grant.proof) ||
      !this.matchesProof(current, grant.proof)
    )
      throw authError('AUTH_PROOF_REQUIRED');
    return grant.proof;
  }

  private async phoneProof(userId: string): Promise<PhoneProof> {
    const user = await this.users.lockForSignIn(userId);
    if (!user || user.isDisabled || !user.phone || !user.phoneVerifiedAt)
      throw authError('AUTH_PROOF_REQUIRED');
    return {
      phone: user.phone,
      verifiedAt: user.phoneVerifiedAt.toISOString(),
      expiresAt: this.clock.now().getTime() + 600_000,
    };
  }

  private matchesProof(current: PhoneProof, proof: PhoneProof): boolean {
    return (
      current.phone === proof.phone &&
      current.verifiedAt === proof.verifiedAt &&
      proof.expiresAt > this.clock.now().getTime()
    );
  }

  private proofSubject(userId: string, email: string, phone: string) {
    return { target: phone, phone, userId, binding: JSON.stringify([userId, email]) };
  }
}
