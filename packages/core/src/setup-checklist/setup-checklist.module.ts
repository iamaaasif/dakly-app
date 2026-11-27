import { Module } from '@nestjs/common';

import { MetaAuthorizationModule } from '../channels/meta-authorization.module';
import { ProductsModule } from '../products/products.module';
import { StoresModule } from '../stores/stores.module';
import { SetupChecklistController } from './setup-checklist.controller';
import { SetupChecklistService } from './setup-checklist.service';

@Module({
  imports: [MetaAuthorizationModule, ProductsModule, StoresModule],
  controllers: [SetupChecklistController],
  providers: [SetupChecklistService],
})
export class SetupChecklistModule {}
