import { Module } from '@nestjs/common';

import { AdminModule } from '@dakly/core/admin/admin.module';
import { KnowledgeModule } from '@dakly/core/ai/knowledge/knowledge.module';
import { AnalyticsOverviewModule } from '@dakly/core/analytics/analytics-overview.module';
import { AuthModule } from '@dakly/core/auth/auth.module';
import { AutomationsModule } from '@dakly/core/automations/automations.module';
import { CampaignsModule } from '@dakly/core/campaigns/campaigns.module';
import { MetaAuthorizationModule } from '@dakly/core/channels/meta-authorization.module';
import { MetaWebhooksModule } from '@dakly/core/channels/meta-webhooks.module';
import { ConsentsModule } from '@dakly/core/consents/consents.module';
import { ContactsModule } from '@dakly/core/contacts/contacts.module';
import { ContentModule } from '@dakly/core/content/content.module';
import { DashboardModule } from '@dakly/core/dashboard/dashboard.module';
import { DeliveryModule } from '@dakly/core/delivery/delivery.module';
import { ImportsModule } from '@dakly/core/imports/imports.module';
import { LinksModule } from '@dakly/core/links/links.module';
import { InboxModule } from '@dakly/core/messaging/inbox.module';
import { NotificationsModule } from '@dakly/core/notifications/notifications.module';
import { OrdersModule } from '@dakly/core/orders/orders.module';
import { PaymentsModule } from '@dakly/core/payments/payments.module';
import { DatabaseModule } from '@dakly/core/platform/database/database.module';
import { LoggingModule } from '@dakly/core/platform/logging/logging.module';
import { ProductsModule } from '@dakly/core/products/products.module';
import { SavedRepliesModule } from '@dakly/core/saved-replies/saved-replies.module';
import { SegmentsModule } from '@dakly/core/segments/segments.module';
import { SessionsModule } from '@dakly/core/sessions/sessions.module';
import { SmsSendersModule } from '@dakly/core/sms-senders/sms-senders.module';
import { SocialModule } from '@dakly/core/social/social.module';
import { StoresModule } from '@dakly/core/stores/stores.module';
import { WalletsModule } from '@dakly/core/wallets/wallets.module';

import { HealthController } from './health.controller';

@Module({
  imports: [
    AdminModule,
    LoggingModule,
    DatabaseModule,
    AuthModule,
    SessionsModule,
    ContactsModule,
    ContentModule,
    AnalyticsOverviewModule,
    DashboardModule,
    MetaWebhooksModule,
    MetaAuthorizationModule,
    DeliveryModule,
    ProductsModule,
    SavedRepliesModule,
    OrdersModule,
    PaymentsModule,
    ConsentsModule,
    ImportsModule,
    KnowledgeModule,
    LinksModule,
    InboxModule,
    SegmentsModule,
    AutomationsModule,
    CampaignsModule,
    StoresModule,
    SocialModule,
    NotificationsModule,
    WalletsModule,
    SmsSendersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
