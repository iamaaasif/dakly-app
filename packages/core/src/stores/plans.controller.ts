import { Controller, Get, Inject } from '@nestjs/common';

import type { PlansResponse } from '@dakly/contracts/billing';

import { Public } from '../platform/tenancy/access.decorators';
import { StoresService } from './stores.service';

@Controller('plans')
@Public()
export class PlansController {
  constructor(@Inject(StoresService) private readonly stores: StoresService) {}
  @Get()
  list(): Promise<PlansResponse> {
    return this.stores.plans();
  }
}
