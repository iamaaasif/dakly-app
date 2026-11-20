import { Injectable } from '@nestjs/common';

import { KindImportsRepository } from './imports.repository';

@Injectable()
export class ProductImportsRepository extends KindImportsRepository {
  protected readonly kind = 'products_csv';
}
