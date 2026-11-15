import { Body, Inject, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';

import {
  type CreateCustomerInput,
  type CustomerResponse,
  createCustomerSchema,
} from '@dakly/contracts/customers';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { CustomersService } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(@Inject(CustomersService) private readonly customersService: CustomersService) {}

  @Post()
  @RequirePermission('customers.edit')
  create(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Body(new ZodValidationPipe(createCustomerSchema)) input: CreateCustomerInput,
  ): Promise<CustomerResponse> {
    return this.customersService.create(storeId, input, access);
  }

  @Get(':id')
  @RequirePermission('customers.view')
  getById(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerResponse> {
    return this.customersService.getById(storeId, id, access);
  }
}
