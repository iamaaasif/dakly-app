import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

import type {
  PasskeyCreationOptions,
  PasskeyRequestOptions,
  StaffRegistrationInput,
  StaffAuthenticationInput,
} from '@dakly/contracts/staff-auth';

export class PasskeyDriver {
  constructor(private readonly origin: string) {}
  async registration(staff: { id: string; email: string }): Promise<PasskeyCreationOptions> {
    const options = await generateRegistrationOptions({
      rpName: 'Dakly staff',
      rpID: new URL(this.origin).hostname,
      userName: staff.email,
      userID: new TextEncoder().encode(staff.id),
      attestationType: 'none',
      supportedAlgorithmIDs: [-7, -257],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    });
    return {
      challenge: options.challenge,
      rp: options.rp,
      user: options.user,
      pubKeyCredParams: options.pubKeyCredParams,
      authenticatorSelection: options.authenticatorSelection,
      attestation: options.attestation,
    };
  }

  async authentication(credentials: Array<{ id: string }>): Promise<PasskeyRequestOptions> {
    const options = await generateAuthenticationOptions({
      rpID: new URL(this.origin).hostname,
      userVerification: 'required',
      allowCredentials: credentials.map(({ id }) => ({ id })),
    });
    return {
      challenge: options.challenge,
      rpId: options.rpId,
      userVerification: options.userVerification,
      allowCredentials: credentials.map(({ id }) => ({ id, type: 'public-key' })),
    };
  }

  async register(response: StaffRegistrationInput['credential'], challenge: string) {
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: this.origin,
      expectedRPID: new URL(this.origin).hostname,
      requireUserVerification: true,
      supportedAlgorithmIDs: [-7, -257],
    });
    if (!result.verified || !result.registrationInfo)
      throw new Error('Passkey verification failed');
    return result.registrationInfo.credential;
  }

  async authenticate(
    response: StaffAuthenticationInput['credential'],
    challenge: string,
    credential: { id: string; publicKey: Uint8Array; counter: number },
  ) {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: this.origin,
      expectedRPID: new URL(this.origin).hostname,
      requireUserVerification: true,
      credential: { ...credential, publicKey: new Uint8Array(credential.publicKey) },
    });
    if (!result.verified) throw new Error('Passkey verification failed');
    return result.authenticationInfo.newCounter;
  }
}
