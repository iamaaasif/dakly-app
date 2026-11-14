import { StoresModule } from '@dakly/core/stores/stores.module';
import { AuthModule } from '@dakly/core/auth/auth.module';
import { SessionsModule } from '@dakly/core/sessions/sessions.module';
import { Module } from '@nestjs/common';
import { CustomersModule } from '@dakly/core/customers/customers.module';
import { DatabaseModule } from '@dakly/core/platform/database/database.module';
import { LoggingModule } from '@dakly/core/platform/logging/logging.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    LoggingModule,
    DatabaseModule,
    AuthModule,
    SessionsModule,
    CustomersModule,
    StoresModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
