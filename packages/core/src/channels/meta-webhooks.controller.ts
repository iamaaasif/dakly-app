import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UnsupportedMediaTypeException,
  type RawBodyRequest,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  metaWebhookVerificationSchema,
  type MetaWebhookVerification,
} from '@dakly/contracts/meta-webhooks';

import { ProviderCallback, Public } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { MetaWebhooksService } from './meta-webhooks.service';

@Controller('webhooks/meta')
@Public()
export class MetaWebhooksController {
  constructor(@Inject(MetaWebhooksService) private readonly webhooks: MetaWebhooksService) {}

  @Get()
  @ProviderCallback()
  verify(
    @Query(new ZodValidationPipe(metaWebhookVerificationSchema)) input: MetaWebhookVerification,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const challenge = this.webhooks.verifySubscription(input);
    reply.type('text/plain; charset=utf-8');
    return challenge;
  }

  @Post()
  @ProviderCallback()
  @HttpCode(200)
  receive(@Req() request: RawBodyRequest<FastifyRequest>) {
    const mediaType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
    if (mediaType !== 'application/json') throw new UnsupportedMediaTypeException();
    const signature = request.headers['x-hub-signature-256'];
    return this.webhooks.receiveDelivery(
      request.rawBody,
      typeof signature === 'string' ? signature : '',
    );
  }
}
