import { Module } from '@nestjs/common';

import { ContactsModule } from '../contacts/contacts.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { HandPickedSegmentsService } from './hand-picked-segments.service';
import { SegmentsController } from './segments.controller';
import { SegmentsRepository } from './segments.repository';
import { SegmentsService } from './segments.service';

@Module({
  imports: [ClockModule, ContactsModule, OutboxModule],
  controllers: [SegmentsController],
  providers: [SegmentsRepository, SegmentsService, HandPickedSegmentsService],
  exports: [SegmentsService],
})
export class SegmentsModule {}
