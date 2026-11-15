import { Inject, Injectable } from '@nestjs/common';

import type {
  StaffTotpInput,
  StaffRegistrationInput,
  StaffAuthenticationInput,
} from '@dakly/contracts/staff-auth';
import type { AccessIdentity } from '@dakly/providers/cloudflare/access-driver';

import { Clock } from '../platform/clock';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { TotpCredentials } from '../platform/crypto/totp-credentials';
import { StaffAuditService } from './staff-audit.service';
import { StaffAuthService } from './staff-auth.service';
import { StaffSessionsService } from './staff-sessions.service';
import { StaffRepository } from './staff.repository';

@Injectable()
export class StaffFactorsService {
  constructor(
    @Inject(StaffAuthService) private readonly auth: StaffAuthService,
    @Inject(StaffRepository) private readonly repository: StaffRepository,
    @Inject(StaffSessionsService) private readonly sessions: StaffSessionsService,
    @Inject(StaffAuditService) private readonly audit: StaffAuditService,
    @Inject(EnvelopeEncryption) private readonly encryption: EnvelopeEncryption,
    @Inject(TotpCredentials) private readonly totp: TotpCredentials,
    @Inject(Clock) private readonly clock: Clock,
  ) {}
  async verifyTotp(input: StaffTotpInput, identity: AccessIdentity, ip: string): Promise<string> {
    await this.auth.checkIp(ip);
    return this.auth.withStaff(identity, ip, async (staff) => {
      const challenge = await this.auth.challenge(staff, input.challenge);
      if (!challenge || !['signin', 'setup_totp'].includes(challenge.purpose)) return undefined;
      const enrolling = challenge.purpose === 'setup_totp';
      if (enrolling === Boolean(staff.enrolledAt)) return undefined;
      const secret = enrolling ? challenge : staff;
      const step = this.verifySecret(staff.id, secret, input.code);
      if (step === null || (staff.totpLastStep !== null && step <= staff.totpLastStep))
        return undefined;
      if (enrolling) {
        await this.audit.record(staff.id, 'staff.enrolled_totp', ip);
        await this.repository.update(staff.id, {
          passwordHash: challenge.passwordHash,
          enrolledAt: this.clock.now(),
          totpSecretCiphertext: secret.totpSecretCiphertext,
          totpKeyVersion: secret.totpKeyVersion,
        });
      }
      await this.repository.update(staff.id, { totpLastStep: step });
      return this.sessions.issue(staff, ip);
    });
  }
  private verifySecret(
    staffUserId: string,
    secret: { totpSecretCiphertext: Buffer | null; totpKeyVersion: number | null },
    code: string,
  ): number | null {
    if (!secret.totpSecretCiphertext || !secret.totpKeyVersion) return null;
    const plaintext = this.encryption.decrypt(
      { owner: 'staff', staffUserId, purpose: 'totp' },
      { ciphertext: secret.totpSecretCiphertext, keyVersion: secret.totpKeyVersion },
    );
    try {
      return this.totp.step(plaintext.toString(), code, this.clock.now().getTime());
    } finally {
      plaintext.fill(0);
    }
  }
  async registerPasskey(
    input: StaffRegistrationInput,
    identity: AccessIdentity,
    ip: string,
  ): Promise<string> {
    await this.auth.checkIp(ip);
    return this.auth.withStaff(identity, ip, async (staff) => {
      const challenge = await this.auth.challenge(staff, input.challenge);
      if (
        staff.enrolledAt ||
        challenge?.purpose !== 'setup_passkey' ||
        !challenge.webauthnChallenge
      )
        return undefined;
      const credential = await this.auth.passkeys
        .register(input.credential, challenge.webauthnChallenge)
        .catch(() => undefined);
      if (!credential) return undefined;
      await this.audit.record(staff.id, 'staff.enrolled_passkey', ip);
      await this.repository.addPasskey(staff.id, credential);
      await this.repository.update(staff.id, {
        passwordHash: challenge.passwordHash,
        enrolledAt: this.clock.now(),
        totpSecretCiphertext: null,
        totpKeyVersion: null,
        totpLastStep: null,
      });
      return this.sessions.issue(staff, ip);
    });
  }
  async authenticatePasskey(
    input: StaffAuthenticationInput,
    identity: AccessIdentity,
    ip: string,
  ): Promise<string> {
    await this.auth.checkIp(ip);
    return this.auth.withStaff(identity, ip, async (staff) => {
      const challenge = await this.auth.challenge(staff, input.challenge);
      if (!staff.enrolledAt || challenge?.purpose !== 'signin' || !challenge.webauthnChallenge)
        return undefined;
      const credential = (await this.repository.passkeys(staff.id)).find(
        (key) => key.id === input.credential.id,
      );
      if (!credential) return undefined;
      const counter = await this.auth.passkeys
        .authenticate(input.credential, challenge.webauthnChallenge, credential)
        .catch(() => undefined);
      if (counter === undefined) return undefined;
      await this.repository.updateCounter(staff.id, credential.id, counter);
      return this.sessions.issue(staff, ip);
    });
  }
}
