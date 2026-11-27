import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import {
  type AddCustomerNoteInput,
  addCustomerNoteSchema,
  type CustomerActivityResponse,
  type CustomerCampaignResponse,
  type CustomerNoteResponse,
  type CustomerOrderResponse,
  type CustomerPage,
  type CustomerProfilePageQuery,
  customerProfilePageQuerySchema,
  type CustomerSummaryResponse,
  type MarketingPreferenceResponse,
  marketingConsentChannelSchema,
  type marketingConsentChannels,
  type SetMarketingConsentInput,
  setMarketingConsentSchema,
} from '@dakly/contracts/customer-profile';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { CustomerProfileService } from './customer-profile.service';

const pageQuery = new ZodValidationPipe(customerProfilePageQuerySchema);

@Controller('contacts/:contactId')
export class CustomerProfileController {
  constructor(@Inject(CustomerProfileService) private readonly profile: CustomerProfileService) {}

  @Get('summary')
  @RequirePermission('customers.view')
  summary(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ): Promise<CustomerSummaryResponse> {
    return this.profile.summary(storeId, contactId, access);
  }

  @Get('orders')
  @RequirePermission('customers.view')
  orders(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Query(pageQuery) query: CustomerProfilePageQuery,
  ): Promise<CustomerPage<CustomerOrderResponse>> {
    return this.profile.orders(storeId, contactId, access, query);
  }

  @Get('activity')
  @RequirePermission('customers.view')
  activity(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Query(pageQuery) query: CustomerProfilePageQuery,
  ): Promise<CustomerPage<CustomerActivityResponse>> {
    return this.profile.activity(storeId, contactId, access, query);
  }

  @Get('campaigns')
  @RequirePermission('customers.view')
  campaigns(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Query(pageQuery) query: CustomerProfilePageQuery,
  ): Promise<CustomerPage<CustomerCampaignResponse>> {
    return this.profile.campaigns(storeId, contactId, access, query);
  }

  @Get('notes')
  @RequirePermission('customers.view')
  listNotes(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ): Promise<CustomerNoteResponse[]> {
    return this.profile.listNotes(storeId, contactId, access);
  }

  @Post('notes')
  @RequirePermission('customers.edit')
  addNote(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body(new ZodValidationPipe(addCustomerNoteSchema)) input: AddCustomerNoteInput,
  ): Promise<CustomerNoteResponse> {
    return this.profile.addNote(storeId, contactId, input.body, { access, userId });
  }

  @Get('marketing-preferences')
  @RequirePermission('customers.view')
  marketingPreferences(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ): Promise<MarketingPreferenceResponse[]> {
    return this.profile.marketingPreferences(storeId, contactId, access);
  }

  @Put('marketing-preferences/:channel')
  @RequirePermission('customers.edit')
  switchMarketing(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Param('channel', new ZodValidationPipe(marketingConsentChannelSchema))
    channel: (typeof marketingConsentChannels)[number],
    @Body(new ZodValidationPipe(setMarketingConsentSchema)) input: SetMarketingConsentInput,
  ): Promise<MarketingPreferenceResponse[]> {
    return this.profile.switchMarketing(
      storeId,
      contactId,
      { ...input, channel },
      { access, actor: { kind: 'user', userId } },
    );
  }
}
