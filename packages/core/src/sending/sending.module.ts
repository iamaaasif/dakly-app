import { Module } from '@nestjs/common';

import { ConsentsModule } from '../consents/consents.module';
import { ContactsModule } from '../contacts/contacts.module';
import { StoresModule } from '../stores/stores.module';
import { SendPolicyService } from './send-policy.service';
import { SendingRepository } from './sending.repository';

@Module({
  imports: [ContactsModule, ConsentsModule, StoresModule],
  providers: [SendPolicyService, SendingRepository],
  exports: [SendPolicyService],
})
export class SendingModule {}
