import { Inject, Injectable } from '@nestjs/common';
import { AppError, PLATFORM_ERRORS } from '../platform/errors/app-error';
import { accountCredentialState } from './account-credential-state';
import { authError } from './auth.errors';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(@Inject(UsersRepository) private readonly repository: UsersRepository) {}
  recoveryTarget(identifier: string) {
    return this.repository.recoveryTarget(identifier);
  }
  async recoveryState(userId: string) {
    const user = await this.repository.lockForSignIn(userId);
    if (!user || user.isDisabled) return undefined;
    const profile = await this.profile(userId);
    return {
      id: user.id,
      name: profile.name,
      phone: user.phoneVerifiedAt ? user.phone : null,
      email: user.emailVerifiedAt ? user.email : null,
      credentialState: accountCredentialState(user),
    };
  }
  async recover(
    userId: string,
    changes: { removeTotp: boolean; newPhone?: string; newEmail?: string },
    now: Date,
  ) {
    if (!(await this.repository.recover(userId, changes, now)))
      throw authError('AUTH_CONTACT_TAKEN');
  }
  lockAccount(userId: string) {
    return this.repository.lockAccount(userId);
  }

  invalidateChallenges(userId: string) {
    return this.repository.invalidateChallenges(userId);
  }

  async profile(userId: string) {
    const user = await this.repository.findProfile(userId);
    if (!user) throw new AppError('AUTH_REQUIRED', PLATFORM_ERRORS.AUTH_REQUIRED);
    return user;
  }
  profiles(userIds: string[]) {
    return this.repository.profiles(userIds);
  }
  verifiedRecipient(storeId: string, input: { phone?: string; email?: string }) {
    return this.repository.verifiedRecipient(storeId, input);
  }
  lockVerifiedIdentity(storeId: string, userId: string) {
    return this.repository.lockVerifiedIdentity(storeId, userId);
  }
}
