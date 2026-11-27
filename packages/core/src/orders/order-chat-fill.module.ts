import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { OrderChatFillController } from './order-chat-fill.controller';
import { OrderChatFillService } from './order-chat-fill.service';

// Apart from OrdersModule so that the orders code does not pull in the AI and billing modules.
@Module({
  imports: [AiModule, DeliveryModule],
  controllers: [OrderChatFillController],
  providers: [OrderChatFillService],
})
export class OrderChatFillModule {}
