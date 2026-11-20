import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import {
  type MatchSuggestionResponse,
  matchSuggestionListQuerySchema,
} from '@dakly/contracts/contacts';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ContactMatchSuggestionsService } from './contact-match-suggestions.service';

@Controller('contact-match-suggestions')
export class ContactMatchSuggestionsController {
  constructor(
    @Inject(ContactMatchSuggestionsService)
    private readonly suggestions: ContactMatchSuggestionsService,
  ) {}

  @Get()
  @RequirePermission('customers.view')
  list(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Query(new ZodValidationPipe(matchSuggestionListQuerySchema))
    query: { contactId: string },
  ): Promise<MatchSuggestionResponse[]> {
    return this.suggestions.list(storeId, query.contactId, access);
  }

  @Post(':suggestionId/dismiss')
  @RequirePermission('customers.edit')
  @HttpCode(204)
  dismiss(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('suggestionId', ParseUUIDPipe) suggestionId: string,
  ): Promise<void> {
    return this.suggestions.dismiss(storeId, suggestionId, userId);
  }
}
