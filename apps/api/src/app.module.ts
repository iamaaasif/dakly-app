import { Module } from '@nestjs/common';
import { CustomersModule } from '@dakly/core/customers/customers.module';
import { DatabaseModule } from '@dakly/core/platform/database/database.module';
import { HealthController } from './health.controller';

@Module({
  imports: [DatabaseModule, CustomersModule],
  controllers: [HealthController],
})
export class AppModule {}
