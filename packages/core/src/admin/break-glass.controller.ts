import { Body, Controller, Inject, Post, Req } from '@nestjs/common';
import {
  breakGlassRequestSchema,
  breakGlassConfirmationSchema,
  type BreakGlassRequest,
  type BreakGlassConfirmation,
} from '@dakly/contracts/break-glass';
import { StaffAccess } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { BreakGlassService } from './break-glass.service';
import type { StaffRequest } from './staff.guard';
@Controller('admin/support/break-glass')
@StaffAccess(true, ['super_admin'])
export class BreakGlassController {
  constructor(@Inject(BreakGlassService) private readonly support: BreakGlassService) {}
  @Post('preview') preview(
    @Req() request: StaffRequest,
    @Body(new ZodValidationPipe(breakGlassRequestSchema)) input: BreakGlassRequest,
  ) {
    return this.support.previewBreakGlass(request.staff, input);
  }
  @Post() confirm(
    @Req() request: StaffRequest,
    @Body(new ZodValidationPipe(breakGlassConfirmationSchema)) input: BreakGlassConfirmation,
  ) {
    return this.support.openBreakGlass(request.staff, input, request.ip);
  }
}
