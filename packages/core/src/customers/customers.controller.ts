import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  type CreateCustomerInput,
  type CustomerResponse,
  createCustomerSchema,
} from '@dakly/contracts/customers';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { StoreGuard } from '../platform/tenancy/store.guard';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { CustomersService } from './customers.service';

@Controller('customers')
@UseGuards(StoreGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(
    @CurrentStore() storeId: string,
    @Body(new ZodValidationPipe(createCustomerSchema)) input: CreateCustomerInput,
  ): Promise<CustomerResponse> {
    return this.customersService.create(storeId, input);
  }

  @Get(':id')
  getById(
    @CurrentStore() storeId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerResponse> {
    return this.customersService.getById(storeId, id);
  }
}
