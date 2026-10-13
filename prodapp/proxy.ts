import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { authConfigured } from './lib/membership-config';

const authenticate = clerkMiddleware();
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // Pages and API handlers independently deny access when configuration is absent.
  return authConfigured() ? authenticate(request, event) : NextResponse.next();
}
export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};

