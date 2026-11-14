import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { TotpConfirmInput, TotpSetupInput } from '@dakly/contracts/totp';
import { AccountTransaction } from '../platform/database/account-transaction';
import { EnvelopeEncryption, type EncryptedSecret } from '../platform/crypto/envelope-encryption';
import { ValkeyClient } from '../platform/cache/valkey-client';
import { Clock } from '../platform/clock';
import { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import { UsersRepository } from './users.repository';
import { TotpRepository } from './totp.repository';
import { TotpCredentials } from './totp-credentials';
import { PasswordCredentials } from './password-credentials';
import { SignInCodes } from './sign-in-codes';
import { SignInFailures, type SignInSubject } from './sign-in-failures';
import { accountCredentialState } from './account-credential-state';
import { authKey } from './auth-key';
import { authError } from './auth.errors';

type Account = NonNullable<Awaited<ReturnType<UsersRepository['lockForSignIn']>>>;
type Setup = {
  state: string;
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
    await this.codes.send(this.subject(user), 'totp_setup', ip, undefined, {
      ...this.passwords.proof(user.id, user.passwordHash),
      identifierState: accountCredentialState(user),
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
    return this.transaction.run(userId, async () => {
      const current = await this.current(userId);
      if (current.totpEnabledAt) throw authError('AUTH_TOTP_ENABLED');
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
      await this.cache.connection.set(
        authKey('totp-setup', setupId),
        JSON.stringify({
          userId,
          sessionId,
          state: accountCredentialState(current),
          ciphertext: envelope.ciphertext.toString('base64'),
          keyVersion: envelope.keyVersion,
        } satisfies Setup),
        'EX',
        300,
      );
      return { setupId, uri: generated.uri };
    });
  }
  async confirm(userId: string, sessionId: string, input: TotpConfirmInput, ip: string) {
    const user = await this.current(userId);
    const subject = this.subject(user);
    await this.failures.assertAllowed(subject, ip);
    const data = await this.cache.connection.get(authKey('totp-setup', input.setupId));
    if (!data) throw authError('AUTH_TOTP_INVALID');
    const setup = JSON.parse(data) as Setup;
    if (setup.userId !== userId || setup.sessionId !== sessionId)
      throw authError('AUTH_TOTP_INVALID');
    const result = await this.transaction.run(userId, async () => {
      const current = await this.current(userId);
      if (current.totpEnabledAt || setup.state !== accountCredentialState(current))
        throw authError('AUTH_TOTP_INVALID');
      const envelope: EncryptedSecret = {
        ciphertext: Buffer.from(setup.ciphertext, 'base64'),
        keyVersion: setup.keyVersion,
      };
      const plaintext = this.encryption.decrypt(
        { owner: 'user', userId, purpose: 'totp' },
        envelope,
      );
      let step: number | null;
      try {
        step = this.credentials.step(plaintext.toString(), input.code, this.clock.now().getTime());
      } finally {
        plaintext.fill(0);
      }
      if (step === null) return undefined;
      if ((await this.cache.connection.del(authKey('totp-setup', input.setupId))) !== 1)
        throw authError('AUTH_TOTP_INVALID');
      const { backupCodes } = this.credentials.generate(current.id);
      await this.repository.enable(
        userId,
        envelope,
        backupCodes.map((code) => this.credentials.hashBackup(userId, code)),
        step,
        this.clock.now(),
      );
      await this.events.record(userId, { event: 'totp.enabled', actor: { kind: 'user' }, ip });
      return { backupCodes };
    });
    if (!result) {
      await this.failures.recordFailure(subject, ip);
      throw authError('AUTH_TOTP_INVALID');
    }
    return result;
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
