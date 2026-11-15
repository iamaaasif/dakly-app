import { Public } from '@dakly/core/platform/tenancy/access.decorators';
import { Controller, Get } from '@nestjs/common';

@Controller('health')
@Public()
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
