import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../audit/audit.module';
import { ClockModule } from '../platform/clock.module';
import { ProductsModule } from '../products/products.module';
import { TeamModule } from '../team/team.module';
import { UsageModule } from '../usage/usage.module';
import { BrandProfileController } from './brand-profile.controller';
import { ContentPiecesController } from './content-pieces.controller';
import { ContentRepository } from './content.repository';
import { ContentService } from './content.service';
import { ProductDescriptionController } from './product-description.controller';

@Module({
  imports: [AiModule, AuditModule, ClockModule, ProductsModule, TeamModule, UsageModule],
  controllers: [BrandProfileController, ContentPiecesController, ProductDescriptionController],
  providers: [ContentRepository, ContentService],
})
export class ContentModule {}
