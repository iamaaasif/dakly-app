import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { ContactsModule } from '../contacts/contacts.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { CacheModule } from '../platform/cache/cache.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { ProductsModule } from '../products/products.module';
import { StoresModule } from '../stores/stores.module';
import { BuyerOrdersRepository } from './buyer-orders.repository';
import { BuyerOrdersService } from './buyer-orders.service';
import { ChatOrdersService } from './chat-orders.service';
import { OrderAttributionRepository } from './order-attribution.repository';
import { OrderAttributionService } from './order-attribution.service';
import { OrderCatalogueController } from './order-catalogue.controller';
import { OrderConfirmationController } from './order-confirmation.controller';
import { OrderConfirmationRepository } from './order-confirmation.repository';
import { OrderConfirmationService } from './order-confirmation.service';
import { OrderProductArchiveController } from './order-product-archive.controller';
import { OrderReportingRepository } from './order-reporting.repository';
import { OrderReportingService } from './order-reporting.service';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    AuditModule,
    CacheModule,
    ClockModule,
    ContactsModule,
    DeliveryModule,
    OutboxModule,
    ProductsModule,
    StoresModule,
  ],
  controllers: [
    OrdersController,
    OrderProductArchiveController,
    OrderCatalogueController,
    OrderConfirmationController,
  ],
  providers: [
    BuyerOrdersRepository,
    BuyerOrdersService,
    ChatOrdersService,
    OrdersRepository,
    OrdersService,
    OrderReportingRepository,
    OrderReportingService,
    OrderAttributionRepository,
    OrderAttributionService,
    OrderConfirmationRepository,
    OrderConfirmationService,
  ],
  exports: [
    BuyerOrdersService,
    ChatOrdersService,
    OrdersService,
    OrderReportingService,
    OrderAttributionService,
    OrderConfirmationService,
  ],
})
export class OrdersModule {}
