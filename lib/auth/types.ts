export interface SessionPayload {
  userId: string;
  username: string;
  avatar: string;
  role: 'admin' | 'developer' | 'viewer';
  iat?: number;
  exp?: number;
}

export interface UserPrefs {
  githubToken: string;
  defaultRepo: string;
  theme: string;
}
