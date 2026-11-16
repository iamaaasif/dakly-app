import { Controller, Headers, Inject, Sse } from '@nestjs/common';
import type { Observable } from 'rxjs';

import { lastEventIdSchema } from '@dakly/contracts/notifications';

import { AnyMember } from '../platform/tenancy/access.decorators';
import { CurrentSession } from '../platform/tenancy/current-session.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { NotificationStreamService, type StreamMessage } from './notification-stream.service';

@Controller('events')
export class EventStreamController {
  constructor(
    @Inject(NotificationStreamService) private readonly stream: NotificationStreamService,
  ) {}

  @Sse('stream')
  @AnyMember()
  open(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentSession() sessionId: string,
    @Headers('last-event-id') lastEventId?: string,
  ): Observable<StreamMessage> {
    // A reconnecting EventSource sends the id of the last message it received.
    const replayAfter = new ZodValidationPipe(lastEventIdSchema).transform(lastEventId);
    return this.stream.open({ storeId, userId, sessionId }, replayAfter);
  }
}
