export type AuthRole = 'admin' | 'editor' | 'viewer';

export interface AuthUserRecord {
  userId: string;
  email: string;
  passwordHash: string;
  role: AuthRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicAuthUser {
  userId: string;
  email: string;
  role: AuthRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PasswordResetTokenRecord {
  token: string;
  userId: string;
  email: string;
  expiresAt: string;
  createdAt: string;
}
