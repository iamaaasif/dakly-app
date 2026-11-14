import { Inject, Injectable } from '@nestjs/common';
import type {
  ChangeEmailInput,
  RequestEmailCodeInput,
  VerifyNewEmailInput,
} from '@dakly/contracts/auth';
import { AccountTransaction } from '../platform/database/account-transaction';
import { Clock } from '../platform/clock';
import { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import { UsersRepository } from './users.repository';
import { SignInCodes, type PhoneProof } from './sign-in-codes';
import { authError } from './auth.errors';

@Injectable()
export class EmailChangeService {
  constructor(
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(SignInCodes) private readonly codes: SignInCodes,
    @Inject(AccountTransaction) private readonly transaction: AccountTransaction,
    @Inject(AccountSecurityEventsService) private readonly events: AccountSecurityEventsService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async requestProof(userId: string, input: RequestEmailCodeInput, ip: string): Promise<void> {
    const proof = await this.phoneProof(userId);
    // This action proves control of the existing phone, even when sign-in prefers email.
    await this.codes.send(
      this.proofSubject(userId, input.email, proof.phone),
      'email_change_proof',
      ip,
      undefined,
      proof,
    );
  }

  async requestChange(userId: string, input: ChangeEmailInput, ip: string): Promise<void> {
    const current = await this.phoneProof(userId);
    const grant = await this.codes.consume(
      this.proofSubject(userId, input.email, current.phone),
      'email_change_proof',
      input.proofCode,
      ip,
    );
    if (grant.userId !== userId || !grant.proof || !this.matchesProof(current, grant.proof))
      throw authError('AUTH_PROOF_REQUIRED');
    await this.codes.send(
      { target: input.email, email: input.email, userId, binding: userId },
      'add_email',
      ip,
      undefined,
      grant.proof,
    );
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
    try {
      await this.transaction.run(userId, async () => {
        const current = await this.phoneProof(userId);
        if (!this.matchesProof(current, proof)) throw authError('AUTH_PROOF_REQUIRED');
        await this.users.changeEmail(userId, input.email, this.clock.now());
        await this.events.record(userId, { event: 'email.changed', actor: { kind: 'user' }, ip });
      });
    } catch (error) {
      // Translate only the email uniqueness violation; the account action has already rolled back.
      if (this.isEmailConflict(error)) throw authError('AUTH_EMAIL_TAKEN');
      throw error;
    }
  }

  private isEmailConflict(error: unknown): boolean {
    const cause = error instanceof Error && error.cause ? error.cause : error;
    return (
      typeof cause === 'object' &&
      cause !== null &&
      'code' in cause &&
      cause.code === '23505' &&
      'constraint' in cause &&
      cause.constraint === 'users_email_key'
    );
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
