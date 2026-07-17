import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSession } from '@/lib/auth/jwt-session';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/login?error=' + error, req.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID || '',
      client_secret: process.env.GITHUB_CLIENT_SECRET || '',
      code: code,
      redirect_uri: new URL('/api/auth/callback', req.url).toString()
    })
  });

  const data = await tokenRes.json();
  if (!data.access_token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const userRes = await fetch('https://api.github.com/user', {
    headers: { 'Authorization': `Bearer ${data.access_token}` }
  });
  const user = await userRes.json();

  const session = await createSession({
    userId: String(user.id),
    username: user.login,
    avatar: user.avatar_url || '',
    role: 'developer'
  });

  const cookiesList = await cookies();
  cookiesList.set('subagent-session', session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
    sameSite: 'lax'
  });

  return NextResponse.redirect(new URL('/dashboard', req.url));
}
