import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  const cookiesList = await cookies();
  cookiesList.set('subagent-session', '', { maxAge: 0, path: '/' });

  return NextResponse.json({ loggedOut: true });
}
