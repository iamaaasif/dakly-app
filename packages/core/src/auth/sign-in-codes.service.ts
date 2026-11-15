import { Inject, Injectable } from '@nestjs/common';

import { SignInCodes } from './sign-in-codes';

export type { SignInSubject } from './sign-in-failures';

// Other features send and check challenge codes through this service only.
@Injectable()
export class SignInCodesService {
  constructor(@Inject(SignInCodes) private readonly codes: SignInCodes) {}

  send(request: Parameters<SignInCodes['send']>[0]): ReturnType<SignInCodes['send']> {
    return this.codes.send(request);
  }

  consume(...args: Parameters<SignInCodes['consume']>): ReturnType<SignInCodes['consume']> {
    return this.codes.consume(...args);
  }
}
