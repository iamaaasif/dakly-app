import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { MetaAuthorizationModule } from '../channels/meta-authorization.module';
import { ConsentsModule } from '../consents/consents.module';
import { ContactsModule } from '../contacts/contacts.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { ProductSearchModule } from '../product-search/product-search.module';
import { ProductsModule } from '../products/products.module';
import { SendingModule } from '../sending/sending.module';
import { SocialModule } from '../social/social.module';
import { StoresModule } from '../stores/stores.module';
import { CommentPostProductsService } from './comment-post-products.service';
import { CommentsController } from './comments.controller';
import { CommentsRepository } from './comments.repository';
import { CommentsService } from './comments.service';

@Module({
  imports: [
    AuditModule,
    ClockModule,
    ConsentsModule,
    ContactsModule,
    MetaAuthorizationModule,
    OutboxModule,
    ProductSearchModule,
    ProductsModule,
    SendingModule,
    SocialModule,
    StoresModule,
  ],
  controllers: [CommentsController],
  providers: [CommentPostProductsService, CommentsRepository, CommentsService],
  exports: [CommentPostProductsService, CommentsService],
})
export class CommentsModule {}
