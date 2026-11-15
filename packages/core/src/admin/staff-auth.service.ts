import { Inject, Injectable } from '@nestjs/common';

import type {
  StaffSignInInput,
  StaffEnrollmentInput,
  StaffEnrollment,
  StaffChallenge,
} from '@dakly/contracts/staff-auth';
import type { AccessIdentity } from '@dakly/providers/cloudflare/access-driver';
import { PasskeyDriver } from '@dakly/providers/webauthn/passkey-driver';

import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { hashPassword, verifyPassword } from '../platform/crypto/password';
import { hashToken } from '../platform/crypto/token-hash';
import { TotpCredentials } from '../platform/crypto/totp-credentials';
import { StaffTransaction } from '../platform/database/staff-transaction';
import { MINUTE_MS } from '../platform/time';
import { staffError } from './admin.errors';
import { StaffAttempts } from './staff-attempts';
import { StaffAuditService } from './staff-audit.service';
import { newStaffProof } from './staff-tokens';
import { StaffRepository } from './staff.repository';

const STAFF_CHALLENGE_TTL_MS = 5 * MINUTE_MS;
export type LockedStaff = NonNullable<Awaited<ReturnType<StaffRepository['lock']>>>;
@Injectable()
export class StaffAuthService {
  readonly passkeys = new PasskeyDriver(loadEnv().ADMIN_ORIGIN);
  constructor(
    @Inject(StaffRepository) private readonly repository: StaffRepository,
    @Inject(StaffTransaction) private readonly transaction: StaffTransaction,
    @Inject(StaffAttempts) private readonly attempts: StaffAttempts,
    @Inject(TotpCredentials) private readonly totp: TotpCredentials,
    @Inject(EnvelopeEncryption) private readonly encryption: EnvelopeEncryption,
    @Inject(StaffAuditService) private readonly audit: StaffAuditService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async withStaff<T>(
    identity: AccessIdentity,
    ip: string,
    work: (staff: LockedStaff) => Promise<T | undefined>,
  ): Promise<T> {
    const id = await this.repository.findIdentity(identity.subject, identity.email);
    if (!id) throw staffError('STAFF_INVALID_CREDENTIALS');
    const result = await this.transaction.run(id, async () => {
      const staff = await this.repository.lock(id);
      if (
        !staff ||
        staff.status !== 'active' ||
        staff.accessSubject !== identity.subject ||
        staff.email.toLowerCase() !== identity.email
      )
        return undefined;
      this.attempts.assertAllowed(staff);
      const value = await work(staff);
      if (value === undefined) {
        await this.audit.record(staff.id, 'staff.authentication_failed', ip);
        await this.attempts.failed(staff);
      }
      return value;
    });
    if (result === undefined) throw staffError('STAFF_INVALID_CREDENTIALS');
    return result;
  }

  checkIp(ip: string): Promise<void> {
    return this.attempts.ip(ip);
  }

  async signIn(
    input: StaffSignInInput,
    identity: AccessIdentity,
    ip: string,
  ): Promise<StaffChallenge> {
    await this.checkIp(ip);
    // Argon2 runs outside the transaction; the hash is checked again under the staff lock.
    const id = await this.repository.findIdentity(identity.subject, identity.email);
    const snapshot = id ? await this.repository.lock(id) : undefined;
    const passwordHash = snapshot?.passwordHash;
    const valid = passwordHash && (await verifyPassword(passwordHash, input.password));
    return this.withStaff(identity, ip, async (staff) => {
      if (
        !valid ||
        staff.email.toLowerCase() !== input.email ||
        !staff.enrolledAt ||
        staff.passwordHash !== passwordHash
      )
        return undefined;
      const credentials = await this.repository.passkeys(staff.id);
      const passkey = credentials.length
        ? await this.passkeys.authentication(credentials)
        : undefined;
      const factors: StaffChallenge['factors'] = [];
      if (staff.totpSecretCiphertext) factors.push('totp');
      if (passkey) factors.push('passkey');
      if (!factors.length) return undefined;
      const challenge = newStaffProof();
      await this.repository.addChallenge(staff.id, {
        tokenHash: hashToken(challenge),
        purpose: 'signin',
        passwordState: hashToken(staff.passwordHash!).toString('hex'),
        webauthnChallenge: passkey?.challenge,
        expiresAt: this.expiry(),
      });
      return { challenge, factors, passkey };
    });
  }

  async enroll(
    input: StaffEnrollmentInput,
    identity: AccessIdentity,
    ip: string,
  ): Promise<StaffEnrollment> {
    await this.checkIp(ip);
    const passwordHash = await hashPassword(input.password);
    return this.withStaff(identity, ip, async (staff) => {
      const grant = await this.challenge(staff, input.proof);
      if (staff.enrolledAt || grant?.purpose !== 'enroll') return undefined;
      const challenge = newStaffProof();
      const response: StaffEnrollment = { challenge };
      const values = {
        tokenHash: hashToken(challenge),
        passwordHash,
        expiresAt: this.expiry(),
      };
      if (input.factor === 'totp') {
        const generated = this.totp.generate(`staff:${staff.email}`);
        const encrypted = this.encryption.encrypt(
          { owner: 'staff', staffUserId: staff.id, purpose: 'totp' },
          Buffer.from(generated.secret),
        );
        response.totp = { secret: generated.secret, uri: generated.uri };
        await this.repository.addChallenge(staff.id, {
          ...values,
          purpose: 'setup_totp',
          totpSecretCiphertext: encrypted.ciphertext,
          totpKeyVersion: encrypted.keyVersion,
        });
      } else {
        response.passkey = await this.passkeys.registration(staff);
        await this.repository.addChallenge(staff.id, {
          ...values,
          purpose: 'setup_passkey',
          webauthnChallenge: response.passkey.challenge,
        });
      }
      await this.audit.record(staff.id, 'staff.enrollment_started', ip);
      await this.repository.consume(staff.id, hashToken(input.proof), this.clock.now());
      return response;
    });
  }

  async challenge(staff: LockedStaff, token: string) {
    const challenge = await this.repository.challenge(staff.id, hashToken(token));
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= this.clock.now())
      return undefined;
    if (
      challenge.purpose === 'signin' &&
      challenge.passwordState !== hashToken(staff.passwordHash ?? '').toString('hex')
    )
      return undefined;
    return challenge;
  }

  private expiry() {
    return new Date(this.clock.now().getTime() + STAFF_CHALLENGE_TTL_MS);
  }
}
