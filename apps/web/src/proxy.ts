import { NextResponse, type NextRequest } from 'next/server';

// Server layouts cannot see the URL, so requireSession reads it from this header.
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-dakly-path', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!api|support/api|_next/static|_next/image|favicon.ico).*)'],
};
