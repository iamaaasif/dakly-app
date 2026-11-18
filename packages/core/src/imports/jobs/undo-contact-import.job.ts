import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { importUndoRequestedEventSchema } from '@dakly/contracts/events/contacts';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ImportsService } from '../imports.service';

// A rerun finds the contacts still not deleted, so a crash between batches loses nothing.
@HandlesEvent('import.undo_requested', { queue: QUEUES.bulk })
export class UndoContactImport implements JobHandler {
  constructor(@Inject(ImportsService) private readonly importsService: ImportsService) {}

  async handle(data: unknown) {
    const { storeId, payload } = importUndoRequestedEventSchema
      .extend({ id: z.uuid() })
      .parse(data);
    await this.importsService.finishUndo(storeId, payload.importId, { kind: 'system' });
  }
}
