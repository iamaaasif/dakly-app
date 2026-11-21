import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { CacheModule } from '../platform/cache/cache.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { ContactDeletionService } from './contact-deletion.service';
import { ContactExportRepository } from './contact-export.repository';
import { ContactExportService } from './contact-export.service';
import { ContactIdentitiesRepository } from './contact-identities.repository';
import { ContactIdentitiesService } from './contact-identities.service';
import { ContactMatchSuggestionsController } from './contact-match-suggestions.controller';
import { ContactMatchSuggestionsService } from './contact-match-suggestions.service';
import { ContactPhoneAccessService } from './contact-phone-access.service';
import { ContactsController } from './contacts.controller';
import { ContactsRepository } from './contacts.repository';
import { ContactsService } from './contacts.service';
import { ImportContactsRepository } from './import-contacts.repository';
import { KhataCustomersService } from './khata-customers.service';
import { OrderContactsRepository } from './order-contacts.repository';

@Module({
  imports: [AuditModule, CacheModule, ClockModule, OutboxModule],
  controllers: [ContactsController, ContactMatchSuggestionsController],
  providers: [
    ContactsService,
    ContactDeletionService,
    KhataCustomersService,
    ContactExportService,
    ContactExportRepository,
    ContactsRepository,
    ContactIdentitiesRepository,
    ContactIdentitiesService,
    ContactMatchSuggestionsService,
    ContactPhoneAccessService,
    ImportContactsRepository,
    OrderContactsRepository,
  ],
  exports: [
    ContactsService,
    KhataCustomersService,
    ContactIdentitiesService,
    ContactMatchSuggestionsService,
  ],
})
export class ContactsModule {}
