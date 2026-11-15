import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import {
  createRoleSchema,
  changeRoleSchema,
  roleListQuerySchema,
  type CreateRoleInput,
  type ChangeRoleInput,
  type RoleListQuery,
  type RoleListResponse,
  type RoleResponse,
  type StoreAccess,
} from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { RolesService } from './roles.service';

@Controller('roles')
export class RolesController {
  constructor(@Inject(RolesService) private readonly roles: RolesService) {}
  @Get()
  @RequirePermission('team.view')
  list(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(roleListQuerySchema)) query: RoleListQuery,
  ): Promise<RoleListResponse> {
    return this.roles.list(storeId, query);
  }

  @Post()
  @RequirePermission('team.edit')
  create(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Body(new ZodValidationPipe(createRoleSchema)) input: CreateRoleInput,
  ): Promise<RoleResponse> {
    return this.roles.create(storeId, input, { userId, access });
  }

  @Patch(':roleId')
  @RequirePermission('team.edit')
  change(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentAccess() access: StoreAccess,
    @Body(new ZodValidationPipe(changeRoleSchema)) input: ChangeRoleInput,
  ): Promise<RoleResponse> {
    return this.roles.change(storeId, roleId, input, { userId, access });
  }

  @Delete(':roleId')
  @HttpCode(204)
  @RequirePermission('team.edit')
  remove(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentAccess() access: StoreAccess,
  ): Promise<void> {
    return this.roles.remove(storeId, roleId, { userId, access });
  }
}
