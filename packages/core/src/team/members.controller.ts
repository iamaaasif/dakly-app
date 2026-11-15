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
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import {
  inviteMemberSchema,
  memberListQuerySchema,
  memberRoleSchema,
  type InviteMemberInput,
  type MemberListQuery,
  type MemberListResponse,
  type MemberResponse,
  type MemberRoleInput,
  type StoreAccess,
} from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { MembersService } from './members.service';

@Controller('members')
export class MembersController {
  constructor(@Inject(MembersService) private readonly members: MembersService) {}
  @Get()
  @RequirePermission('team.view')
  list(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Query(new ZodValidationPipe(memberListQuerySchema)) query: MemberListQuery,
  ): Promise<MemberListResponse> {
    return this.members.list(storeId, query, access);
  }

  @Post('invites')
  @RequirePermission('team.edit')
  invite(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Req() request: FastifyRequest,
    @Body(new ZodValidationPipe(inviteMemberSchema)) input: InviteMemberInput,
  ): Promise<MemberResponse> {
    return this.members.invite(storeId, input, { userId, access }, request.ip);
  }

  @Post('invites/:membershipId/resend')
  @HttpCode(200)
  @RequirePermission('team.edit')
  resend(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @CurrentAccess() access: StoreAccess,
    @Req() request: FastifyRequest,
  ): Promise<MemberResponse> {
    return this.members.resend(storeId, membershipId, { userId, access }, request.ip);
  }

  @Patch(':membershipId')
  @RequirePermission('team.edit')
  changeRole(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @CurrentAccess() access: StoreAccess,
    @Body(new ZodValidationPipe(memberRoleSchema)) input: MemberRoleInput,
  ): Promise<MemberResponse> {
    return this.members.changeRole(storeId, membershipId, input, {
      userId,
      access,
    });
  }

  @Delete(':membershipId')
  @HttpCode(204)
  @RequirePermission('team.edit')
  remove(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @CurrentAccess() access: StoreAccess,
  ): Promise<void> {
    return this.members.remove(storeId, membershipId, { userId, access });
  }
}
