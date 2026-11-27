import { Module } from '@nestjs/common';

import { ConsentsModule } from '../consents/consents.module';
import { ContactsModule } from '../contacts/contacts.module';
import { FileStorageModule } from '../platform/file-storage/file-storage.module';
import { ContactNotesRepository } from './contact-notes.repository';
import { CustomerProfileController } from './customer-profile.controller';
import { CustomerProfileRepository } from './customer-profile.repository';
import { CustomerProfileService } from './customer-profile.service';

@Module({
  imports: [ConsentsModule, ContactsModule, FileStorageModule],
  controllers: [CustomerProfileController],
  providers: [CustomerProfileRepository, ContactNotesRepository, CustomerProfileService],
})
export class CustomerProfileModule {}
