import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { KillSwitchesRepository } from './kill-switches.repository';
import { KillSwitchesService } from './kill-switches.service';

@Module({
  imports: [ClockModule],
  providers: [KillSwitchesRepository, KillSwitchesService],
  exports: [KillSwitchesService],
})
export class KillSwitchesModule {}
