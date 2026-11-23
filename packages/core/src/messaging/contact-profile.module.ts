import { Module } from '@nestjs/common';

import { MetaAuthorizationModule } from '../channels/meta-authorization.module';
import { ContactsModule } from '../contacts/contacts.module';
import { ContactProfileService } from './contact-profile.service';

@Module({
  imports: [ContactsModule, MetaAuthorizationModule],
  providers: [ContactProfileService],
  exports: [ContactProfileService],
})
export class ContactProfileModule {}
