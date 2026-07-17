import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSession, SessionPayload } from '@/lib/auth/jwt-session';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';

export async function GET(req: Request) {
  const redirectUrl = new URL('https://github.com/login/oauth/authorize');
  redirectUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
  redirectUrl.searchParams.set('redirect_uri', `${req.headers.get('origin')}/api/auth/callback`);
  redirectUrl.searchParams.set('scope', 'repo');

  return NextResponse.redirect(redirectUrl.toString());
}
