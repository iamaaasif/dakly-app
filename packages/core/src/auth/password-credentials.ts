import { Inject, Injectable } from '@nestjs/common';
import { verifyPassword } from '../platform/crypto/password';
import { UsersRepository } from './users.repository';
import { SignInFailures, type SignInSubject } from './sign-in-failures';
import { Clock } from '../platform/clock';
import { authKey } from './auth-key';
import { authError } from './auth.errors';
import type { PasswordProof } from './sign-in-codes';

export function passwordState(userId: string, hash: string | null): string {
  return authKey('password-state', JSON.stringify([userId, hash]));
}

@Injectable()
export class PasswordCredentials {
  constructor(
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(SignInFailures) private readonly failures: SignInFailures,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async check(subject: SignInSubject, password: string, ip: string): Promise<PasswordProof> {
    await this.failures.assertAllowed(subject, ip);
    // This short read finishes before the expensive verification; callers recheck the proof under lock.
    const user = subject.userId ? await this.users.lockForSignIn(subject.userId) : undefined;
    if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
      await this.failures.recordFailure(this.failureSubject(subject, user), ip);
      throw authError('AUTH_INVALID_CREDENTIALS');
    }
    if (user.isDisabled) throw authError('AUTH_DISABLED');
    return this.proof(user.id, user.passwordHash);
  }

  private failureSubject(
    subject: SignInSubject,
    user: Awaited<ReturnType<UsersRepository['lockForSignIn']>>,
  ): SignInSubject {
    if (!user) return subject;
    return {
      ...subject,
      phone: user.phone ?? undefined,
      email: user.emailVerifiedAt ? (user.email ?? undefined) : undefined,
    };
  }

  proof(userId: string, hash: string | null): PasswordProof {
    return {
      passwordState: passwordState(userId, hash),
      expiresAt: this.clock.now().getTime() + 600_000,
    };
  }

  assertCurrent(userId: string, hash: string | null, proof: PasswordProof): void {
    if (
      proof.passwordState !== passwordState(userId, hash) ||
      proof.expiresAt <= this.clock.now().getTime()
    )
      throw authError('AUTH_PROOF_REQUIRED');
  }
}
