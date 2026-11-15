import { Controller, Get } from '@nestjs/common';

import { Public } from '@dakly/core/platform/tenancy/access.decorators';

@Controller('health')
@Public()
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
