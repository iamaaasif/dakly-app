import {
  Controller,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { paymentGatewaySchema } from '@dakly/contracts/payments';
import type { PaymentGateway } from '@dakly/providers/payment/payment-driver';

import { ProviderCallback, Public } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { PaymentCallbacksService } from './payment-callbacks.service';

@Controller('webhooks/payments')
@Public()
export class PaymentCallbacksController {
  constructor(
    @Inject(PaymentCallbacksService) private readonly callbacks: PaymentCallbacksService,
  ) {}

  @Post(':gateway')
  @ProviderCallback()
  @HttpCode(204)
  receive(
    @Param('gateway', new ZodValidationPipe(paymentGatewaySchema)) gateway: PaymentGateway,
    @Req() request: RawBodyRequest<FastifyRequest>,
  ) {
    return this.callbacks.receive(gateway, request.rawBody, request.headers);
  }
}
