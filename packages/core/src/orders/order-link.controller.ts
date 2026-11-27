import { randomBytes, randomUUID } from 'node:crypto';

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { formatMoney } from '@dakly/contracts/money';
import {
  orderLinkSlugSchema,
  placeOrderLinkOrderSchema,
  type PlaceOrderLinkOrderInput,
} from '@dakly/contracts/order-link';

import { AppError } from '../platform/errors/app-error';
import { AllowShortLinkOrigin, Public } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { orderLinkClosedPage, orderLinkPage } from './order-link.page';
import { OrderLinkService } from './order-link.service';

const slugPipe = new ZodValidationPipe(orderLinkSlugSchema);

const HTML = 'text/html; charset=utf-8';
const policy = (nonce: string) =>
  [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' https://challenges.cloudflare.com`,
    'frame-src https://challenges.cloudflare.com',
    "connect-src 'self'",
    'img-src https:',
    "style-src 'unsafe-inline'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');

// The short link domain maps dakly.shop/{store}/{product} onto this path. The store comes from the
// slug on the server and never from the request body.
@Controller('l/o/:slug/:productId')
@Public()
export class OrderLinkController {
  constructor(@Inject(OrderLinkService) private readonly link: OrderLinkService) {}

  @Get()
  async page(
    @Param('slug', slugPipe) slug: string,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    const nonce = randomBytes(16).toString('base64');
    reply
      .type(HTML)
      .header('Cache-Control', 'no-store')
      .header('Referrer-Policy', 'no-referrer')
      .header('Content-Security-Policy', policy(nonce));
    try {
      const view = await this.link.view(slug, productId, request.ip);
      return orderLinkPage(view, { nonce, idempotencyKey: randomUUID() });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      reply.status(error.status);
      return orderLinkClosedPage();
    }
  }

  @Post('orders')
  @AllowShortLinkOrigin()
  @HttpCode(201)
  async place(
    @Param('slug', slugPipe) slug: string,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body(new ZodValidationPipe(placeOrderLinkOrderSchema)) input: PlaceOrderLinkOrderInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ orderNumber: number; message: string }> {
    reply.header('Cache-Control', 'no-store');
    const placed = await this.link.place(slug, productId, input, request.ip);
    return {
      orderNumber: placed.orderNumber,
      message: `অর্ডার হয়েছে! অর্ডার নম্বর #${placed.orderNumber}, মোট ${formatMoney(placed.totalPoisha)}। দোকান শীঘ্রই আপনার সঙ্গে যোগাযোগ করবে। / Order placed. Order #${placed.orderNumber}, total ${formatMoney(placed.totalPoisha)}. The shop will contact you soon.`,
    };
  }
}
