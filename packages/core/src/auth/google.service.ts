import { Inject, Injectable } from '@nestjs/common';
import type { GoogleIdentity } from '@dakly/providers/google/google-identity-driver';
import type {
  GoogleSignInInput,
  GoogleSignInPending,
  VerifyGoogleEmailInput,
} from '@dakly/contracts/auth';
import { AuthService, type SignInRequest } from './auth.service';
import { UsersRepository } from './users.repository';
import { GoogleIdentityService } from './google-identity.service';
import { GoogleTickets, type GoogleGrant } from './google-tickets';
import { SignInCodes } from './sign-in-codes';
import { SignInFailures } from './sign-in-failures';
import { authError } from './auth.errors';
import { authKey } from './auth-key';
import { AppError } from '../platform/errors/app-error';

type GoogleResult = GoogleSignInPending | { token: string };
@Injectable()
export class GoogleService {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(GoogleIdentityService) private readonly identities: GoogleIdentityService,
    @Inject(GoogleTickets) private readonly tickets: GoogleTickets,
    @Inject(SignInCodes) private readonly codes: SignInCodes,
    @Inject(SignInFailures) private readonly failures: SignInFailures,
  ) {}
  async signIn(input: GoogleSignInInput, request: SignInRequest): Promise<GoogleResult> {
    const unknown = { target: authKey('google-token', input.idToken) };
    await this.failures.assertAllowed(unknown, request.ip);
    let identity: GoogleIdentity;
    try {
      identity = await this.identities.verify(input.idToken);
    } catch (error) {
      if (error instanceof AppError && error.code === 'AUTH_INVALID_CREDENTIALS')
        await this.failures.recordFailure(unknown, request.ip);
      throw error;
    }
    const linked = await this.users.findByGoogleSubject(identity.subject);
    if (linked)
      return this.auth.completeSignIn(
        { id: linked.id, target: identity.subject, google: { identity, mode: 'subject' } },
        request,
      );
    const owner = await this.users.findByVerifiedEmail(identity.email);
    if (!identity.emailIsAuthoritative) {
      const grant: GoogleGrant = {
        purpose: 'email',
        identity,
        expectedOwnerId: owner?.id,
        expectedEmailVerifiedAt: owner?.emailVerifiedAt?.toISOString(),
      };
      const verificationTicket = await this.tickets.issue(grant);
      await this.codes.send(
        this.emailSubject(verificationTicket, grant),
        'google_email',
        request.ip,
      );
      return { status: 'email_verification_required', verificationTicket };
    }
    return this.finish(identity, owner?.id, request);
  }
  async verifyEmail(input: VerifyGoogleEmailInput, request: SignInRequest): Promise<GoogleResult> {
    const grant = await this.tickets.read(input.verificationTicket, 'email');
    await this.codes.consume(
      this.emailSubject(input.verificationTicket, grant),
      'google_email',
      input.code,
      request.ip,
    );
    await this.tickets.read(input.verificationTicket, 'email', true);
    const linked = await this.users.findByGoogleSubject(grant.identity.subject);
    const owner = await this.users.findByVerifiedEmail(grant.identity.email);
    if (
      linked ||
      owner?.id !== grant.expectedOwnerId ||
      owner?.emailVerifiedAt?.toISOString() !== grant.expectedEmailVerifiedAt
    )
      throw authError('AUTH_GOOGLE_TICKET_INVALID');
    return this.finish(grant.identity, owner?.id, request, grant.expectedEmailVerifiedAt, true);
  }
  private async finish(
    identity: GoogleIdentity,
    userId: string | undefined,
    request: SignInRequest,
    expectedEmailVerifiedAt?: string,
    expectedUnlinked?: true,
  ): Promise<GoogleResult> {
    if (userId)
      return this.auth.completeSignIn(
        {
          id: userId,
          target: identity.email,
          google: { identity, mode: 'link', expectedEmailVerifiedAt, expectedUnlinked },
        },
        request,
      );
    const signupTicket = await this.tickets.issue({ purpose: 'signup', identity });
    return { status: 'signup_required', signupTicket };
  }
  private emailSubject(ticket: string, grant: GoogleGrant) {
    return {
      target: grant.identity.email,
      email: grant.identity.email,
      userId: grant.expectedOwnerId,
      binding: JSON.stringify([ticket, grant.identity.subject, grant.identity.email]),
    };
  }
}
