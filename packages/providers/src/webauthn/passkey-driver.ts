import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
  SimpleWebAuthnError,
  type SimpleWebAuthnErrorCode,
} from '@simplewebauthn/server';

import type {
  PasskeyCreationOptions,
  PasskeyRequestOptions,
  StaffRegistrationInput,
  StaffAuthenticationInput,
} from '@dakly/contracts/staff-auth';

export class PasskeyVerificationError extends Error {
  constructor(cause?: unknown) {
    super('Passkey verification failed', { cause });
    this.name = 'PasskeyVerificationError';
  }
}

// The library rejects a bad response by throwing. Only these two codes mean our own
// settings or runtime are wrong, so they must not read as a wrong passkey.
const setupErrorCodes: ReadonlySet<SimpleWebAuthnErrorCode> = new Set([
  'BAD_ARGUMENT',
  'RUNTIME_NO_PQC_SUPPORT',
]);

async function verify<TResult>(verification: () => Promise<TResult>): Promise<TResult> {
  try {
    return await verification();
  } catch (error) {
    if (error instanceof SimpleWebAuthnError && setupErrorCodes.has(error.code)) throw error;
    throw new PasskeyVerificationError(error);
  }
}

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
    const expectedRPID = new URL(this.origin).hostname;
    const result = await verify(() =>
      verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: this.origin,
        expectedRPID,
        requireUserVerification: true,
        supportedAlgorithmIDs: [-7, -257],
      }),
    );
    if (!result.verified || !result.registrationInfo) throw new PasskeyVerificationError();
    return result.registrationInfo.credential;
  }

  async authenticate(
    response: StaffAuthenticationInput['credential'],
    challenge: string,
    credential: { id: string; publicKey: Uint8Array; counter: number },
  ) {
    const expectedRPID = new URL(this.origin).hostname;
    const publicKey = new Uint8Array(credential.publicKey);
    const result = await verify(() =>
      verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: this.origin,
        expectedRPID,
        requireUserVerification: true,
        credential: { ...credential, publicKey },
      }),
    );
    if (!result.verified) throw new PasskeyVerificationError();
    return result.authenticationInfo.newCounter;
  }
}
