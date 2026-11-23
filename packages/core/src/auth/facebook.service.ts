import { Inject, Injectable, Logger } from '@nestjs/common';

import type { FacebookStartInput } from '@dakly/contracts/auth';
import type {
  FacebookIdentity,
  FacebookIdentityDriver,
} from '@dakly/providers/facebook/facebook-identity-driver';

import { measureVendorCall } from '../platform/logging/vendor-call-metric';
import { authKey } from './auth-key';
import { authError } from './auth.errors';
import { AuthService, type SignInRequest } from './auth.service';
import { FACEBOOK_IDENTITY_DRIVER } from './facebook-provider';
import { FacebookStates, type FacebookState } from './facebook-states';
import { SignInFailures } from './sign-in-failures';
import { UsersRepository } from './users.repository';

export type FacebookResult = { status: 'totp_required'; challengeId: string } | { token: string };

@Injectable()
export class FacebookService {
  private readonly logger = new Logger(FacebookService.name);
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(FacebookStates) private readonly states: FacebookStates,
    @Inject(SignInFailures) private readonly failures: SignInFailures,
    @Inject(FACEBOOK_IDENTITY_DRIVER) private readonly driver: FacebookIdentityDriver | null,
  ) {}

  async start(input: FacebookStartInput): Promise<{ nonce: string; url: string }> {
    const driver = this.requireDriver();
    const nonce = await this.states.issue({
      termsVersion: input.termsVersion,
      isRemembered: input.remember === '1',
    });
    return { nonce, url: driver.authorizeUrl(nonce) };
  }

  async finish(
    input: { code: string; state: string; cookieNonce: string | undefined },
    request: Omit<SignInRequest, 'isRemembered'>,
  ): Promise<FacebookResult & { isRemembered: boolean; isNewAccount: boolean }> {
    const driver = this.requireDriver();
    // A state that did not start in this browser is a forged or replayed return.
    if (!input.cookieNonce || input.cookieNonce !== input.state)
      throw authError('AUTH_FACEBOOK_STATE_INVALID');
    const state = await this.states.consume(input.state);
    const identity = await this.identify(driver, input.code, request.ip);
    const result = await this.signIn(identity, state, {
      ...request,
      isRemembered: state.isRemembered,
    });
    return { ...result.result, isRemembered: state.isRemembered, isNewAccount: result.isNew };
  }

  private async identify(driver: FacebookIdentityDriver, code: string, ip: string) {
    const unknown = { target: authKey('facebook-code', code) };
    await this.failures.assertAllowed(unknown, ip);
    try {
      return await measureVendorCall(
        this.logger,
        'facebook_identity_verification',
        'Facebook identity verification measured',
        () => driver.identify(code),
      );
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error) {
        if (error.code === 'FACEBOOK_IDENTITY_INVALID') {
          await this.failures.recordFailure(unknown, ip);
          throw authError('AUTH_INVALID_CREDENTIALS');
        }
      }
      throw authError('AUTH_FACEBOOK_UNAVAILABLE');
    }
  }

  private async signIn(identity: FacebookIdentity, state: FacebookState, request: SignInRequest) {
    const linked = await this.users.findByFacebookSubject(identity.subject);
    if (linked)
      return {
        isNew: false,
        result: await this.auth.completeSignIn(
          {
            id: linked.id,
            target: identity.subject,
            facebook: { identity, mode: 'subject' },
          },
          request,
        ),
      };
    if (!identity.email) throw authError('AUTH_FACEBOOK_EMAIL_REQUIRED');
    // Facebook only shares an email the person confirmed, so it may link an account that has
    // the same verified email.
    const owner = await this.users.findByVerifiedEmail(identity.email);
    if (owner)
      return {
        isNew: false,
        result: await this.auth.completeSignIn(
          {
            id: owner.id,
            target: identity.email,
            kind: 'email',
            facebook: { identity, mode: 'link' },
          },
          request,
        ),
      };
    if (!state.termsVersion) throw authError('AUTH_TERMS_REQUIRED');
    return {
      isNew: true,
      result: await this.auth.completeSignIn(
        {
          id: this.users.allocateId(),
          target: identity.email,
          kind: 'email',
          registration: {
            name: identity.name ?? identity.email.split('@')[0]!,
            email: identity.email,
            termsVersion: state.termsVersion,
          },
          facebook: { identity, mode: 'signup' },
        },
        request,
      ),
    };
  }

  private requireDriver(): FacebookIdentityDriver {
    if (!this.driver) throw authError('AUTH_FACEBOOK_UNAVAILABLE');
    return this.driver;
  }
}
