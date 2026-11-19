import { NextRequest, NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/session';

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public invite acceptance page
  if (pathname === '/admin/invite') {
    return NextResponse.next();
  }

  // Allow public login page and static assets
  if (pathname === '/admin/login') {
    const authed = Boolean(await getActiveSession(req));
    if (authed) {
      return NextResponse.redirect(new URL('/admin', req.url));
    }
    return NextResponse.next();
  }

  // Protect /admin/*
  if (pathname.startsWith('/admin')) {
    const authed = Boolean(await getActiveSession(req));
    if (!authed) {
      const loginUrl = new URL('/admin/login', req.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
