import { RequirePermission } from '../platform/tenancy/access.decorators';
import type { StoreRequest } from '../platform/tenancy/store-request';
import {
  Body,
  Inject,
  Req,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
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
  constructor(@Inject(CustomersService) private readonly customersService: CustomersService) {}

  @Post()
  @RequirePermission('customers.edit')
  create(
    @CurrentStore() storeId: string,
    @Req() request: StoreRequest,
    @Body(new ZodValidationPipe(createCustomerSchema)) input: CreateCustomerInput,
  ): Promise<CustomerResponse> {
    return this.customersService.create(storeId, input, request.access!);
  }

  @Get(':id')
  @RequirePermission('customers.view')
  getById(
    @CurrentStore() storeId: string,
    @Req() request: StoreRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerResponse> {
    return this.customersService.getById(storeId, id, request.access!);
  }
}
