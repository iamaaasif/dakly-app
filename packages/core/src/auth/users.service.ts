import { Inject, Injectable } from '@nestjs/common';
import { AppError, PLATFORM_ERRORS } from '../platform/errors/app-error';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(@Inject(UsersRepository) private readonly repository: UsersRepository) {}
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
