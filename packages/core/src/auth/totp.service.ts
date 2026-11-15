import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { TotpConfirmInput, TotpSetupInput } from '@dakly/contracts/totp';

import { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import { ValkeyClient } from '../platform/cache/valkey-client';
import { Clock } from '../platform/clock';
import { EnvelopeEncryption, type EncryptedSecret } from '../platform/crypto/envelope-encryption';
import { TotpCredentials } from '../platform/crypto/totp-credentials';
import { AccountTransaction } from '../platform/database/account-transaction';
import { SessionsService } from '../sessions/sessions.service';
import { accountCredentialState } from './account-credential-state';
import { authKey } from './auth-key';
import { authError } from './auth.errors';
import { PasswordCredentials } from './password-credentials';
import { SignInCodes } from './sign-in-codes';
import { SignInFailures, type SignInSubject } from './sign-in-failures';
import { TotpRepository } from './totp.repository';
import { UsersRepository } from './users.repository';

type Account = NonNullable<Awaited<ReturnType<UsersRepository['lockForSignIn']>>>;
type Setup = {
  state: string;
  expiresAt: number;
  userId: string;
  sessionId: string;
  ciphertext: string;
  keyVersion: number;
};
@Injectable()
export class TotpService {
  constructor(
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(TotpRepository) private readonly repository: TotpRepository,
    @Inject(TotpCredentials) private readonly credentials: TotpCredentials,
    @Inject(PasswordCredentials) private readonly passwords: PasswordCredentials,
    @Inject(SignInCodes) private readonly codes: SignInCodes,
    @Inject(SignInFailures) private readonly failures: SignInFailures,
    @Inject(AccountTransaction) private readonly transaction: AccountTransaction,
    @Inject(AccountSecurityEventsService) private readonly events: AccountSecurityEventsService,
    @Inject(EnvelopeEncryption) private readonly encryption: EnvelopeEncryption,
    @Inject(ValkeyClient) private readonly cache: ValkeyClient,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(SessionsService) private readonly sessions: SessionsService,
  ) {}

  async current(userId: string): Promise<Account> {
    const user = await this.users.lockForSignIn(userId);
    if (!user || user.isDisabled) throw authError('AUTH_TOTP_INVALID');
    return user;
  }

  subject(user: Account): SignInSubject {
    return {
      userId: user.id,
      target: user.phone ?? user.email ?? user.id,
      phone: user.phoneVerifiedAt ? (user.phone ?? undefined) : undefined,
      email: user.emailVerifiedAt ? (user.email ?? undefined) : undefined,
      binding: user.id,
    };
  }

  async requestSetupProof(userId: string, ip: string) {
    const user = await this.current(userId);
    await this.codes.send({
      subject: this.subject(user),
      purpose: 'totp_setup',
      ip,
      proof: {
        ...this.passwords.proof(user.id, user.passwordHash),
        identifierState: accountCredentialState(user),
      },
    });
  }

  async setup(userId: string, sessionId: string, input: TotpSetupInput, ip: string) {
    const user = await this.current(userId);
    const subject = this.subject(user);
    const proof =
      'currentPassword' in input
        ? await this.passwords.check(subject, input.currentPassword, ip)
        : (await this.codes.consume(subject, 'totp_setup', input.proofCode, ip)).proof;
    if (!proof || !('passwordState' in proof)) throw authError('AUTH_PROOF_REQUIRED');
    const prepared = await this.transaction.run(userId, async () => {
      const current = await this.current(userId);
      if (current.totpEnabledAt) throw authError('AUTH_TOTP_ENABLED');
      if (!(await this.sessions.isActive(userId, sessionId))) throw authError('AUTH_TOTP_INVALID');
      this.passwords.assertCurrent(userId, current.passwordHash, proof);
      if (
        accountCredentialState(current) !== accountCredentialState(user) ||
        (proof.identifierState && proof.identifierState !== accountCredentialState(current))
      )
        throw authError('AUTH_PROOF_REQUIRED');
      const generated = this.credentials.generate(current.phone ?? current.email ?? current.id);
      const envelope = this.encryption.encrypt(
        { owner: 'user', userId, purpose: 'totp' },
        Buffer.from(generated.secret),
      );
      const setupId = randomBytes(32).toString('base64url');
      return {
        setupId,
        uri: generated.uri,
        payload: {
          userId,
          sessionId,
          state: accountCredentialState(current),
          expiresAt: this.clock.now().getTime() + 300000,
          ciphertext: envelope.ciphertext.toString('base64'),
          keyVersion: envelope.keyVersion,
        } satisfies Setup,
      };
    });
    await this.cache.connection.set(
      authKey('totp-setup', prepared.setupId),
      JSON.stringify(prepared.payload),
      'EX',
      300,
    );
    return { setupId: prepared.setupId, uri: prepared.uri };
  }

  async confirm(userId: string, sessionId: string, input: TotpConfirmInput, ip: string) {
    const user = await this.current(userId);
    const subject = this.subject(user);
    await this.failures.assertAllowed(subject, ip);
    const data = await this.cache.connection.get(authKey('totp-setup', input.setupId));
    if (!data) throw authError('AUTH_TOTP_INVALID');
    const setup = JSON.parse(data) as Setup;
    if (
      setup.userId !== userId ||
      setup.sessionId !== sessionId ||
      !Number.isFinite(setup.expiresAt) ||
      setup.expiresAt <= this.clock.now().getTime()
    )
      throw authError('AUTH_TOTP_INVALID');
    const envelope: EncryptedSecret = {
      ciphertext: Buffer.from(setup.ciphertext, 'base64'),
      keyVersion: setup.keyVersion,
    };
    const plaintext = this.encryption.decrypt({ owner: 'user', userId, purpose: 'totp' }, envelope);
    let step: number | null;
    try {
      step = this.credentials.step(plaintext.toString(), input.code, this.clock.now().getTime());
    } finally {
      plaintext.fill(0);
    }
    if (step === null) {
      await this.failures.recordFailure(subject, ip);
      throw authError('AUTH_TOTP_INVALID');
    }
    // Consumption precedes the account lock and is never undone after a database failure.
    if ((await this.cache.connection.del(authKey('totp-setup', input.setupId))) !== 1)
      throw authError('AUTH_TOTP_INVALID');
    return this.transaction.run(userId, async () => {
      const current = await this.current(userId);
      if (
        current.totpEnabledAt ||
        setup.state !== accountCredentialState(current) ||
        setup.expiresAt <= this.clock.now().getTime() ||
        Math.abs(Math.floor(this.clock.now().getTime() / 30000) - step) > 1 ||
        !(await this.sessions.isActive(userId, sessionId))
      )
        throw authError('AUTH_TOTP_INVALID');
      const { backupCodes } = this.credentials.generate(current.id);
      await this.repository.enable(userId, {
        envelope,
        backupCodeHashes: backupCodes.map((code) => this.credentials.hashBackup(userId, code)),
        step,
        now: this.clock.now(),
      });
      await this.events.record(userId, { event: 'totp.enabled', actor: { kind: 'user' }, ip });
      return { backupCodes };
    });
  }

  async verify(user: Account, code: string): Promise<boolean> {
    if (!user.totpEnabledAt || !user.totpSecretCiphertext || !user.totpKeyVersion) return false;
    if (/^[a-f0-9]{20}$/.test(code))
      return this.repository.consumeBackup(user.id, this.credentials.hashBackup(user.id, code));
    const plaintext = this.encryption.decrypt(
      { owner: 'user', userId: user.id, purpose: 'totp' },
      { ciphertext: user.totpSecretCiphertext, keyVersion: user.totpKeyVersion },
    );
    try {
      const step = this.credentials.step(plaintext.toString(), code, this.clock.now().getTime());
      return step === null ? false : this.repository.useStep(user.id, step);
    } finally {
      plaintext.fill(0);
    }
  }

  async disable(userId: string, code: string, ip: string) {
    const subject = this.subject(await this.current(userId));
    await this.failures.assertAllowed(subject, ip);
    const success = await this.transaction.run(userId, async () => {
      if (!(await this.verify(await this.current(userId), code))) return false;
      await this.repository.disable(userId, this.clock.now());
      await this.events.record(userId, { event: 'totp.disabled', actor: { kind: 'user' }, ip });
      return true;
    });
    if (!success) {
      await this.failures.recordFailure(subject, ip);
      throw authError('AUTH_TOTP_INVALID');
    }
  }
}
