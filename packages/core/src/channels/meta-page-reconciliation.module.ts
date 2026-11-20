import { Module } from '@nestjs/common';

import { ReconcileMetaPageSubscriptionsJob } from './jobs/reconcile-meta-page-subscriptions.job';
import { MetaAuthorizationModule } from './meta-authorization.module';

@Module({
  imports: [MetaAuthorizationModule],
  providers: [ReconcileMetaPageSubscriptionsJob],
})
export class MetaPageReconciliationModule {}
