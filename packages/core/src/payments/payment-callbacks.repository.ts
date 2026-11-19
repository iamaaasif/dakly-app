import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type { Database } from '@dakly/db/client';

import { DATABASE } from '../platform/database/database.tokens';

@Injectable()
export class PaymentCallbacksRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findByReference(reference: string) {
    const { rows } = await this.database.execute<{ store_id: string; payment_intent_id: string }>(
      sql`select store_id, payment_intent_id from payment_intent_for_reference(${reference})`,
    );
    return rows[0];
  }

  async dueChecks(limit: number) {
    const { rows } = await this.database.execute<{ store_id: string; payment_intent_id: string }>(
      sql`select store_id, payment_intent_id from due_payment_checks(${limit})`,
    );
    return rows;
  }
}
