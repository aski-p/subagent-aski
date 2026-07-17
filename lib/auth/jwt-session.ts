import { SignJWT, jwtVerify } from 'jose';

export type SessionPayload = {
  userId: string;
  username: string;
  avatar: string;
  role: 'admin' | 'developer' | 'viewer';
  iat?: number;
  exp?: number;
};

export type UserPrefs = {
  githubToken: string;
  defaultRepo: string;
  theme: string;
};

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'subagent-aski-jwt-secret-change-me'
);

export async function createSession(payload: SessionPayload): Promise<string> {
  const jwt = await new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
  return jwt;
}

export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
