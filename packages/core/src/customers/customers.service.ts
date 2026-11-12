import { Injectable } from '@nestjs/common';
import type { CreateCustomerInput, CustomerResponse } from '@dakly/contracts/customers';
import { customerError } from './customers.errors';
import { type Customer, CustomersRepository } from './customers.repository';

@Injectable()
export class CustomersService {
  constructor(private readonly customersRepository: CustomersRepository) {}

  async create(storeId: string, input: CreateCustomerInput): Promise<CustomerResponse> {
    const customer = await this.customersRepository.insert(storeId, input);
    if (!customer) {
      throw customerError('CUSTOMER_PHONE_TAKEN');
    }
    return toCustomerResponse(customer);
  }

  async getById(storeId: string, id: string): Promise<CustomerResponse> {
    const customer = await this.customersRepository.findById(storeId, id);
    if (!customer) {
      throw customerError('CUSTOMER_NOT_FOUND');
    }
    return toCustomerResponse(customer);
  }
}

function toCustomerResponse(customer: Customer): CustomerResponse {
  return { ...customer, createdAt: customer.createdAt.toISOString() };
}
