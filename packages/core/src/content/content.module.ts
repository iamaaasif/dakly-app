import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { ClockModule } from '../platform/clock.module';
import { BrandProfileController } from './brand-profile.controller';
import { ContentPiecesController } from './content-pieces.controller';
import { ContentRepository } from './content.repository';
import { ContentService } from './content.service';

@Module({
  imports: [AuditModule, ClockModule],
  controllers: [BrandProfileController, ContentPiecesController],
  providers: [ContentRepository, ContentService],
})
export class ContentModule {}
