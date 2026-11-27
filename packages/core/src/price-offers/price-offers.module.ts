import { Module } from '@nestjs/common';

import { AiAgentSettingsModule } from '../ai-agent/ai-agent-settings.module';
import { ClockModule } from '../platform/clock.module';
import { ProductsModule } from '../products/products.module';
import { PriceOffersRepository } from './price-offers.repository';
import { PriceOffersService } from './price-offers.service';

@Module({
  imports: [AiAgentSettingsModule, ClockModule, ProductsModule],
  providers: [PriceOffersRepository, PriceOffersService],
  exports: [PriceOffersService],
})
export class PriceOffersModule {}
