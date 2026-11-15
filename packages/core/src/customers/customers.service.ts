import { Inject, Injectable } from '@nestjs/common';

import type { CreateCustomerInput, CustomerResponse } from '@dakly/contracts/customers';
import { maskPhone } from '@dakly/contracts/phone';
import type { StoreAccess } from '@dakly/contracts/team';

import { customerError } from './customers.errors';
import { type Customer, CustomersRepository } from './customers.repository';

@Injectable()
export class CustomersService {
  constructor(
    @Inject(CustomersRepository) private readonly customersRepository: CustomersRepository,
  ) {}

  async create(
    storeId: string,
    input: CreateCustomerInput,
    access: Pick<StoreAccess, 'seeFullPhone'>,
  ): Promise<CustomerResponse> {
    const customer = await this.customersRepository.insert(storeId, input);
    if (!customer) {
      throw customerError('CUSTOMER_PHONE_TAKEN');
    }
    return toCustomerResponse(customer, access.seeFullPhone);
  }

  async getById(
    storeId: string,
    id: string,
    access: Pick<StoreAccess, 'seeFullPhone'>,
  ): Promise<CustomerResponse> {
    const customer = await this.customersRepository.findById(storeId, id);
    if (!customer) {
      throw customerError('CUSTOMER_NOT_FOUND');
    }
    return toCustomerResponse(customer, access.seeFullPhone);
  }
}

function toCustomerResponse(customer: Customer, seeFullPhone: boolean): CustomerResponse {
  return {
    ...customer,
    phone: seeFullPhone ? customer.phone : maskPhone(customer.phone),
    createdAt: customer.createdAt.toISOString(),
  };
}
