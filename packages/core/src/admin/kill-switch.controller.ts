import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Put, Req } from '@nestjs/common';

import {
  changeKillSwitchSchema,
  killSwitchFeatureSchema,
  type ChangeKillSwitchInput,
  type KillSwitchChangeResponse,
  type KillSwitchFeature,
  type KillSwitchListResponse,
} from '@dakly/contracts/kill-switches';

import { StaffAccess } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { KillSwitchAdminService } from './kill-switch-admin.service';
import type { StaffRequest } from './staff.guard';
import { killSwitchRoles, killSwitchViewRoles } from './support-roles';

const featurePipe = new ZodValidationPipe(killSwitchFeatureSchema);
const bodyPipe = new ZodValidationPipe(changeKillSwitchSchema);

@Controller('admin')
export class KillSwitchController {
  constructor(@Inject(KillSwitchAdminService) private readonly admin: KillSwitchAdminService) {}

  @Get('kill-switches')
  @StaffAccess(true, killSwitchViewRoles)
  list(): Promise<KillSwitchListResponse> {
    return this.admin.list();
  }

  @Put('kill-switches/:feature')
  @StaffAccess(true, killSwitchRoles)
  changeGlobal(
    @Req() request: StaffRequest,
    @Param('feature', featurePipe) feature: KillSwitchFeature,
    @Body(bodyPipe) input: ChangeKillSwitchInput,
  ): Promise<KillSwitchChangeResponse> {
    return this.admin.change({
      staff: request.staff,
      feature,
      storeId: null,
      input,
      ip: request.ip,
    });
  }

  @Put('stores/:storeId/kill-switches/:feature')
  @StaffAccess(true, killSwitchRoles)
  changeForStore(
    @Req() request: StaffRequest,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('feature', featurePipe) feature: KillSwitchFeature,
    @Body(bodyPipe) input: ChangeKillSwitchInput,
  ): Promise<KillSwitchChangeResponse> {
    return this.admin.change({ staff: request.staff, feature, storeId, input, ip: request.ip });
  }
}
