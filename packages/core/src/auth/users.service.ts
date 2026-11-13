import { Inject, Injectable } from '@nestjs/common';
import { AppError, PLATFORM_ERRORS } from '../platform/errors/app-error';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(@Inject(UsersRepository) private readonly repository: UsersRepository) {}
  async profile(userId: string) {
    const user = await this.repository.findProfile(userId);
    if (!user) throw new AppError('AUTH_REQUIRED', PLATFORM_ERRORS.AUTH_REQUIRED);
    return user;
  }
}
