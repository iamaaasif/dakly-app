import {
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Redirect,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { trackedLinkCodeSchema } from '@dakly/contracts/campaigns';

import { Public } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { LinksService } from './links.service';

const codePipe = new ZodValidationPipe(trackedLinkCodeSchema);
// Set only on success, so an error still goes out as the usual JSON body.
const HTML = 'text/html; charset=utf-8';
const PAGE_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'";

// The short link domain (A4) maps its paths onto /l; the store comes only from the code.
@Controller('l')
@Public()
export class LinksController {
  constructor(@Inject(LinksService) private readonly links: LinksService) {}

  @Get(':code')
  @Redirect(undefined, 302)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async redirect(
    @Param('code', codePipe) code: string,
    @Req() request: FastifyRequest,
  ): Promise<{ url: string }> {
    const userAgent = request.headers['user-agent'];
    return { url: await this.links.redirect(code, { ip: request.ip, userAgent }) };
  }

  @Get('s/:code')
  @Header('Content-Security-Policy', PAGE_POLICY)
  async optOutPage(
    @Param('code', codePipe) code: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    await this.links.assertOptOutLink(code, request.ip);
    reply.type(HTML);
    return page(
      'অফার এসএমএস বন্ধ করুন',
      `<p>এই দোকান থেকে আর অফারের এসএমএস পাবেন না। অর্ডারের খবর আগের মতোই পাবেন।</p>
<p lang="en">Stop offer SMS from this shop. You will still get updates about your orders.</p>
<form method="post" enctype="text/plain"><button type="submit">বন্ধ করুন / Stop offers</button></form>`,
    );
  }

  @Post('s/:code')
  @HttpCode(200)
  @Header('Content-Security-Policy', PAGE_POLICY)
  async optOut(
    @Param('code', codePipe) code: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    await this.links.optOut(code, request.ip);
    reply.type(HTML);
    return page(
      'অফার এসএমএস বন্ধ হয়েছে',
      `<p>এই দোকান থেকে আর অফারের এসএমএস পাবেন না। আবার চাইলে দোকানকে জানান।</p>
<p lang="en">Offer SMS from this shop are stopped. To get them again, tell the shop.</p>`,
    );
  }
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="bn">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;line-height:1.5}button{font-size:1.1rem;padding:.75rem 1.5rem}</style></head>
<body><h1>${title}</h1>
${body}
</body>
</html>`;
}
