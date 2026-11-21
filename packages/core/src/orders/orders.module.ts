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
import { KhataSalesRepository } from './khata-sales.repository';
import { KhataSalesService } from './khata-sales.service';
import { OrderAdvancesService } from './order-advances.service';
import { OrderAttributionRepository } from './order-attribution.repository';
import { OrderAttributionService } from './order-attribution.service';
import { OrderCatalogueController } from './order-catalogue.controller';
import { OrderConfirmationController } from './order-confirmation.controller';
import { OrderConfirmationRepository } from './order-confirmation.repository';
import { OrderConfirmationService } from './order-confirmation.service';
import { BOT_CHECK_DRIVER, createBotCheckDriver } from './order-link-provider';
import { OrderLinkController } from './order-link.controller';
import { OrderLinkService } from './order-link.service';
import { OrderProductArchiveController } from './order-product-archive.controller';
import { OrderReportingRepository } from './order-reporting.repository';
import { OrderReportingService } from './order-reporting.service';
import { OrderSetupRepository } from './order-setup.repository';
import { OrderSetupService } from './order-setup.service';
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
    OrderLinkController,
  ],
  providers: [
    BuyerOrdersRepository,
    BuyerOrdersService,
    ChatOrdersService,
    KhataSalesRepository,
    KhataSalesService,
    OrdersRepository,
    OrdersService,
    OrderAdvancesService,
    OrderSetupRepository,
    OrderSetupService,
    OrderReportingRepository,
    OrderReportingService,
    OrderAttributionRepository,
    OrderAttributionService,
    OrderConfirmationRepository,
    OrderConfirmationService,
    OrderLinkService,
    { provide: BOT_CHECK_DRIVER, useFactory: createBotCheckDriver },
  ],
  exports: [
    BuyerOrdersService,
    OrderAdvancesService,
    ChatOrdersService,
    KhataSalesService,
    OrdersService,
    OrderSetupService,
    OrderReportingService,
    OrderAttributionService,
    OrderConfirmationService,
  ],
})
export class OrdersModule {}
