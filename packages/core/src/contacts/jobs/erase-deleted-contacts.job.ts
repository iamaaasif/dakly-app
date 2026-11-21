import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ContactErasureService } from '../contact-erasure.service';

export const ERASE_DELETED_CONTACTS = 'erase-deleted-contacts';

// The scheduler sweep has no store: the service finds the due customers across stores.
const payload = z.strictObject({});

@HandlesJob({ queue: QUEUES.bulk, name: ERASE_DELETED_CONTACTS })
export class EraseDeletedContactsJob implements JobHandler {
  constructor(@Inject(ContactErasureService) private readonly erasure: ContactErasureService) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.erasure.eraseDeletedCustomers();
  }
}
