import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { AreasController } from './areas.controller';
import { DeliveryController } from './delivery.controller';
import { DeliveryRepository } from './delivery.repository';
import { DeliveryService } from './delivery.service';

@Module({
  imports: [ClockModule],
  controllers: [DeliveryController, AreasController],
  providers: [DeliveryRepository, DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
