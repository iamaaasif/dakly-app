import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { AutomationsController } from './automations.controller';
import { AutomationsRepository } from './automations.repository';
import { AutomationsService } from './automations.service';

@Module({
  imports: [ClockModule],
  controllers: [AutomationsController],
  providers: [AutomationsRepository, AutomationsService],
  exports: [AutomationsService],
})
export class AutomationsModule {}
