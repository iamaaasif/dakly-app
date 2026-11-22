import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';

import {
  suggestProductOptionsSchema,
  type SuggestedOptionsResponse,
  type SuggestProductOptionsInput,
} from '@dakly/contracts/products';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ProductOptionSuggestionsService } from './product-option-suggestions.service';

@Controller('products/suggest-options')
export class ProductOptionSuggestionsController {
  constructor(
    @Inject(ProductOptionSuggestionsService)
    private readonly service: ProductOptionSuggestionsService,
  ) {}

  @Post()
  @RequirePermission('products.edit')
  @HttpCode(200)
  suggest(
    @CurrentStore() storeId: string,
    @Body(new ZodValidationPipe(suggestProductOptionsSchema)) input: SuggestProductOptionsInput,
  ): Promise<SuggestedOptionsResponse> {
    return this.service.suggest(storeId, input);
  }
}
