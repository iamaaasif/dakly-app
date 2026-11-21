import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { ReconciliationRepository } from './reconciliation.repository';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [ClockModule],
  providers: [ReconciliationRepository, ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
