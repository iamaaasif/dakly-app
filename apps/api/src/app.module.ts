import { Module } from '@nestjs/common';

import { AdminModule } from '@dakly/core/admin/admin.module';
import { AuthModule } from '@dakly/core/auth/auth.module';
import { ConsentsModule } from '@dakly/core/consents/consents.module';
import { ContactsModule } from '@dakly/core/contacts/contacts.module';
import { NotificationsModule } from '@dakly/core/notifications/notifications.module';
import { DatabaseModule } from '@dakly/core/platform/database/database.module';
import { LoggingModule } from '@dakly/core/platform/logging/logging.module';
import { SessionsModule } from '@dakly/core/sessions/sessions.module';
import { StoresModule } from '@dakly/core/stores/stores.module';
import { WalletsModule } from '@dakly/core/wallets/wallets.module';

import { HealthController } from './health.controller';

@Module({
  imports: [
    AdminModule,
    LoggingModule,
    DatabaseModule,
    AuthModule,
    SessionsModule,
    ContactsModule,
    ConsentsModule,
    StoresModule,
    NotificationsModule,
    WalletsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
