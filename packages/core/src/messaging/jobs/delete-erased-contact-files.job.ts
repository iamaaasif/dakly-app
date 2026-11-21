import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { contactErasedEventSchema } from '@dakly/contracts/events/contacts';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ErasedContactFilesService } from '../erased-contact-files.service';

const event = contactErasedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('contact.erased', { queue: QUEUES.bulk })
export class DeleteErasedContactFilesJob implements JobHandler {
  constructor(
    @Inject(ErasedContactFilesService) private readonly files: ErasedContactFilesService,
  ) {}

  async handle(data: unknown) {
    const { storeId, payload } = event.parse(data);
    await this.files.deleteFiles(storeId, payload.conversationIds, payload.attachmentKeys);
  }
}
