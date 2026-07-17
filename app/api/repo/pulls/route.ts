import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/auth/jwt-session';

const GITHUB_API = 'https://api.github.com';

export async function GET(req: Request) {
  const cookie = await cookies();
  const session = await verifySession(cookie.get('subagent-session')?.value || '');

  if (!session) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { repo_name } = Object.fromEntries(
    new URL(req.url).searchParams.entries()
  ) as { repo_name?: string };

  if (repo_name) {
    const res = await fetch(`${GITHUB_API}/repos/${session.username}/${repo_name}/pulls?state=open&per_page=5`, {
      headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` }
    });
    const pulls = await res.json();
    return NextResponse.json(pulls);
  }

  return NextResponse.json({ message: 'Use ?repo_name=X to list PRs' });
}
