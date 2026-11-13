import { Module } from '@nestjs/common';
import { PermissionGuard } from '../platform/tenancy/permission.guard';
import { PERMISSION_EVALUATOR } from '../platform/tenancy/permission-evaluator';
import { canAccess, hasKnownRole } from './permissions';

@Module({
  providers: [
    { provide: PERMISSION_EVALUATOR, useValue: { canAccess, hasKnownRole } },
    PermissionGuard,
  ],
  exports: [PERMISSION_EVALUATOR, PermissionGuard],
})
export class TeamModule {}
