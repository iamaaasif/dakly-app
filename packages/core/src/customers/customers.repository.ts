import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { customers } from '@dakly/db/schema/customers';
import type { CreateCustomerInput } from '@dakly/contracts/customers';
import { TenantDatabase } from '../platform/database/tenant-database';

export type Customer = {
  id: string;
  name: string;
  phone: string;
  createdAt: Date;
};

const customerColumns = {
  id: customers.id,
  name: customers.name,
  phone: customers.phone,
  createdAt: customers.createdAt,
};

@Injectable()
export class CustomersRepository {
  constructor(private readonly database: TenantDatabase) {}

  async findById(storeId: string, id: string): Promise<Customer | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select(customerColumns)
        .from(customers)
        .where(and(eq(customers.storeId, storeId), eq(customers.id, id)))
        .limit(1),
    );
    return rows[0];
  }

  // Returns undefined when the phone already exists in this store.
  async insert(storeId: string, input: CreateCustomerInput): Promise<Customer | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(customers)
        .values({ storeId, name: input.name, phone: input.phone })
        .onConflictDoNothing({ target: [customers.storeId, customers.phone] })
        .returning(customerColumns),
    );
    return rows[0];
  }
}
