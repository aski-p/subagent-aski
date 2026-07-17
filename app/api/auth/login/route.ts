import { NextResponse } from 'next/server';
import { createSession, SessionPayload } from '@/lib/auth/jwt-session';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'placeholder_client_id';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || 'placeholder_secret';

function getBaseUrl(req: Request): string {
  // Priority: X-Forwarded-Host (Vercel proxy) > Origin header > fallback
  const forwarded = req.headers.get('x-forwarded-host') || req.headers.get('x-forwarded-proto')
    ? `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host')}`
    : null;
  if (forwarded) return forwarded;
  const origin = req.headers.get('origin');
  if (origin) return origin;
  // Dev fallback
  return 'http://localhost:3099';
}

export async function GET(req: Request) {
  const baseUrl = getBaseUrl(req);
  const redirectUrl = new URL('https://github.com/login/oauth/authorize');
  redirectUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
  redirectUrl.searchParams.set('redirect_uri', `${baseUrl}/api/auth/callback`);
  redirectUrl.searchParams.set('scope', 'repo');

  return NextResponse.redirect(redirectUrl.toString());
}
