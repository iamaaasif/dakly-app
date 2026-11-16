import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import {
  type NotificationListQuery,
  type NotificationListResponse,
  notificationListQuerySchema,
  type SnoozeNotificationInput,
  snoozeNotificationSchema,
} from '@dakly/contracts/notifications';

import { AnyMember } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

// Every member reads and changes only their own rows, so no area permission applies.
@Controller('notifications')
@AnyMember()
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(notificationListQuerySchema)) query: NotificationListQuery,
  ): Promise<NotificationListResponse> {
    return this.notifications.list(storeId, userId, query);
  }

  @Post(':notificationId/seen')
  @HttpCode(204)
  markSeen(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ): Promise<void> {
    return this.notifications.markSeen(storeId, userId, notificationId);
  }

  @Post(':notificationId/done')
  @HttpCode(204)
  markDone(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ): Promise<void> {
    return this.notifications.markDone(storeId, userId, notificationId);
  }

  @Post(':notificationId/snooze')
  @HttpCode(204)
  snooze(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
    @Body(new ZodValidationPipe(snoozeNotificationSchema)) input: SnoozeNotificationInput,
  ): Promise<void> {
    return this.notifications.snooze(storeId, userId, notificationId, input);
  }
}
