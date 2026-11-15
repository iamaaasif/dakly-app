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
  UseGuards,
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
} from '@dakly/contracts/team';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { RequirePermission } from '../platform/tenancy/access.decorators';
import { StoreGuard } from '../platform/tenancy/store.guard';
import type { StoreRequest } from '../platform/tenancy/store-request';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { MembersService } from './members.service';

@Controller('members')
@UseGuards(StoreGuard)
export class MembersController {
  constructor(@Inject(MembersService) private readonly members: MembersService) {}
  @Get()
  @RequirePermission('team.view')
  list(
    @CurrentStore() storeId: string,
    @Req() request: StoreRequest,
    @Query(new ZodValidationPipe(memberListQuerySchema)) query: MemberListQuery,
  ): Promise<MemberListResponse> {
    return this.members.list(storeId, query, request.access!);
  }
  @Post('invites')
  @RequirePermission('team.edit')
  invite(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Req() request: FastifyRequest & StoreRequest,
    @Body(new ZodValidationPipe(inviteMemberSchema)) input: InviteMemberInput,
  ): Promise<MemberResponse> {
    return this.members.invite(storeId, input, { userId, access: request.access! }, request.ip);
  }
  @Post('invites/:membershipId/resend')
  @HttpCode(200)
  @RequirePermission('team.edit')
  resend(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Req() request: FastifyRequest & StoreRequest,
  ): Promise<MemberResponse> {
    return this.members.resend(
      storeId,
      membershipId,
      { userId, access: request.access! },
      request.ip,
    );
  }
  @Patch(':membershipId')
  @RequirePermission('team.edit')
  changeRole(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Req() request: StoreRequest,
    @Body(new ZodValidationPipe(memberRoleSchema)) input: MemberRoleInput,
  ): Promise<MemberResponse> {
    return this.members.changeRole(storeId, membershipId, input, {
      userId,
      access: request.access!,
    });
  }
  @Delete(':membershipId')
  @HttpCode(204)
  @RequirePermission('team.edit')
  remove(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Req() request: StoreRequest,
  ): Promise<void> {
    return this.members.remove(storeId, membershipId, { userId, access: request.access! });
  }
}
