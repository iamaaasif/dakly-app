import {
  applyDecorators,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  orderConfirmationAnswerSchema,
  orderConfirmationTokenSchema,
  type OrderConfirmationAnswer,
} from '@dakly/contracts/orders';

import { AllowShortLinkOrigin, Public } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { confirmationPage, outcomePage } from './order-confirmation.page';
import { OrderConfirmationService } from './order-confirmation.service';

const tokenPipe = new ZodValidationPipe(orderConfirmationTokenSchema);

const HTML = 'text/html; charset=utf-8';
const PAGE_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'";

const privatePage = () =>
  applyDecorators(
    Header('Cache-Control', 'no-store'),
    Header('Referrer-Policy', 'no-referrer'),
    Header('Content-Security-Policy', PAGE_POLICY),
  );

// The short link domain maps its paths onto /l; the store comes only from the token.
@Controller('l/c')
@Public()
export class OrderConfirmationController {
  constructor(
    @Inject(OrderConfirmationService) private readonly confirmation: OrderConfirmationService,
  ) {}

  @Get(':token')
  @privatePage()
  async page(
    @Param('token', tokenPipe) token: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    const view = await this.confirmation.view(token, request.ip);
    reply.type(HTML);
    return confirmationPage(view);
  }

  @Post(':token')
  @AllowShortLinkOrigin()
  @HttpCode(200)
  @privatePage()
  async answer(
    @Param('token', tokenPipe) token: string,
    @Query('answer', new ZodValidationPipe(orderConfirmationAnswerSchema))
    answer: OrderConfirmationAnswer,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    const outcome = await this.confirmation.answer(token, answer, request.ip);
    reply.type(HTML);
    return outcomePage(outcome);
  }
}
