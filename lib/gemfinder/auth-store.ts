import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';
import type { AuthRole, AuthUserRecord, PasswordResetTokenRecord, PublicAuthUser } from '@/lib/gemfinder/types';

const LOCAL_STORE_PATH =
  process.env.GEMFINDER_LOCAL_STORE_PATH || path.join(process.cwd(), 'data', 'gemfinder-auth.local.json');

type LocalAuthStore = {
  users: AuthUserRecord[];
  resetTokens: PasswordResetTokenRecord[];
};

let pool: Pool | null = null;
let schemaReady = false;

const SCHEMA_SQL = `
create table if not exists gemfinder_auth_users (
  user_id text primary key,
  email text not null unique,
  password_hash text not null,
  role text not null default 'editor',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists gemfinder_password_reset_tokens (
  token text primary key,
  user_id text not null,
  email text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
`;

function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function useSsl(): boolean {
  const mode = String(process.env.DATABASE_SSL || '').trim().toLowerCase();
  if (['require', 'true', '1', 'yes'].includes(mode)) return true;
  return /sslmode=require/i.test(String(process.env.DATABASE_URL || ''));
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 8,
      ssl: useSsl() ? { rejectUnauthorized: false } : undefined
    });
  }
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (!hasDatabase() || schemaReady) return;
  await getPool().query(SCHEMA_SQL);
  schemaReady = true;
}

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

function authUserIdFromEmail(email: string): string {
  return `user_${crypto.createHash('sha1').update(normalizeEmail(email)).digest('hex').slice(0, 12)}`;
}

function sanitizeRole(role: unknown): AuthRole {
  if (role === 'admin' || role === 'viewer') return role;
  return 'editor';
}

function isAllowedEmail(email: string): boolean {
  const allowed = String(process.env.AR_ALLOWED_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length) return true;
  return allowed.includes(normalizeEmail(email));
}

function isSelfSignupEnabled(): boolean {
  const raw = String(process.env.AR_SELF_SIGNUP || 'true').trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(raw);
}

function isDefaultAdminEmail(email: string): boolean {
  const configured = String(process.env.AR_DEFAULT_ADMIN_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return configured.includes(normalizeEmail(email));
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${digest}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [algo, salt, digest] = String(storedHash || '').split('$');
    if (algo !== 'scrypt' || !salt || !digest) return false;
    const check = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(digest, 'hex');
    if (check.length !== expected.length) return false;
    return crypto.timingSafeEqual(check, expected);
  } catch {
    return false;
  }
}

function toPublicUser(user: AuthUserRecord): PublicAuthUser {
  return {
    userId: user.userId,
    email: user.email,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function emptyStore(): LocalAuthStore {
  return { users: [], resetTokens: [] };
}

function normalizeUserRecord(value: Partial<AuthUserRecord>): AuthUserRecord | null {
  if (!value.userId || !value.email || !value.passwordHash || !value.createdAt || !value.updatedAt) return null;
  return {
    userId: String(value.userId),
    email: normalizeEmail(String(value.email)),
    passwordHash: String(value.passwordHash),
    role: sanitizeRole(value.role),
    active: value.active === undefined ? true : Boolean(value.active),
    createdAt: new Date(String(value.createdAt)).toISOString(),
    updatedAt: new Date(String(value.updatedAt)).toISOString()
  };
}

function normalizeResetToken(value: Partial<PasswordResetTokenRecord>): PasswordResetTokenRecord | null {
  if (!value.token || !value.userId || !value.email || !value.expiresAt || !value.createdAt) return null;
  return {
    token: String(value.token),
    userId: String(value.userId),
    email: normalizeEmail(String(value.email)),
    expiresAt: new Date(String(value.expiresAt)).toISOString(),
    createdAt: new Date(String(value.createdAt)).toISOString()
  };
}

async function readLocalStore(): Promise<LocalAuthStore> {
  try {
    const raw = await fs.readFile(LOCAL_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LocalAuthStore>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users.map(normalizeUserRecord).filter(Boolean) as AuthUserRecord[] : [],
      resetTokens: Array.isArray(parsed.resetTokens) ? parsed.resetTokens.map(normalizeResetToken).filter(Boolean) as PasswordResetTokenRecord[] : []
    };
  } catch {
    return emptyStore();
  }
}

async function writeLocalStore(store: LocalAuthStore): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_STORE_PATH), { recursive: true });
  await fs.writeFile(LOCAL_STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function countActiveAdmins(users: AuthUserRecord[]): number {
  return users.filter((user) => user.active && user.role === 'admin').length;
}

function findUserById(users: AuthUserRecord[], userId: string): AuthUserRecord | undefined {
  return users.find((user) => user.userId === userId);
}

function mapDbUser(row: Record<string, unknown>): AuthUserRecord {
  return {
    userId: String(row.user_id),
    email: normalizeEmail(String(row.email)),
    passwordHash: String(row.password_hash || ''),
    role: sanitizeRole(row.role),
    active: row.active === undefined ? true : Boolean(row.active),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

function mapDbResetToken(row: Record<string, unknown>): PasswordResetTokenRecord {
  return {
    token: String(row.token),
    userId: String(row.user_id),
    email: normalizeEmail(String(row.email)),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

async function findDbUserByEmail(client: PoolClient, email: string): Promise<AuthUserRecord | null> {
  const res = await client.query('select * from gemfinder_auth_users where email = $1 limit 1', [normalizeEmail(email)]);
  return res.rows[0] ? mapDbUser(res.rows[0]) : null;
}

async function findDbUserById(client: PoolClient, userId: string): Promise<AuthUserRecord | null> {
  const res = await client.query('select * from gemfinder_auth_users where user_id = $1 limit 1', [String(userId)]);
  return res.rows[0] ? mapDbUser(res.rows[0]) : null;
}

async function countDbUsers(client: PoolClient): Promise<number> {
  const res = await client.query('select count(*)::int as count from gemfinder_auth_users');
  return Number(res.rows[0]?.count || 0);
}

async function countDbActiveAdmins(client: PoolClient): Promise<number> {
  const res = await client.query("select count(*)::int as count from gemfinder_auth_users where active = true and role = 'admin'");
  return Number(res.rows[0]?.count || 0);
}

async function listDbUsers(client: PoolClient): Promise<PublicAuthUser[]> {
  const res = await client.query('select user_id, email, role, active, created_at, updated_at from gemfinder_auth_users order by email asc');
  return res.rows.map((row) => toPublicUser(mapDbUser({ ...row, password_hash: '' })));
}

export async function registerAuthUser(
  email: string,
  password: string,
  options?: { createdByUserId?: string; role?: AuthRole; active?: boolean }
): Promise<{ ok: true; userId: string; email: string; role: AuthRole } | { ok: false; error: string }> {
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || '');
  if (!cleanEmail || !cleanEmail.includes('@')) return { ok: false, error: 'Invalid email' };
  if (cleanPassword.length < 8) return { ok: false, error: 'Password must be at least 8 characters' };
  if (!isAllowedEmail(cleanEmail)) return { ok: false, error: 'Email is not allowed for this workspace' };

  if (hasDatabase()) {
    await ensureSchema();
    const client = await getPool().connect();
    try {
      await client.query('begin');
      const existing = await findDbUserByEmail(client, cleanEmail);
      if (existing) {
        await client.query('rollback');
        return { ok: false, error: 'Account already exists' };
      }

      let role: AuthRole = 'editor';
      let active = true;

      if (options?.createdByUserId) {
        const actor = await findDbUserById(client, options.createdByUserId);
        if (!actor || !actor.active || actor.role !== 'admin') {
          await client.query('rollback');
          return { ok: false, error: 'Only admin users can create team accounts' };
        }
        role = sanitizeRole(options.role);
        active = options.active !== false;
      } else {
        if (!isSelfSignupEnabled()) {
          await client.query('rollback');
          return { ok: false, error: 'Self signup is disabled' };
        }
        const totalUsers = await countDbUsers(client);
        role = totalUsers === 0 || isDefaultAdminEmail(cleanEmail) ? 'admin' : 'editor';
        active = true;
      }

      const now = new Date().toISOString();
      const userId = authUserIdFromEmail(cleanEmail);
      await client.query(
        `insert into gemfinder_auth_users (user_id, email, password_hash, role, active, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz)`,
        [userId, cleanEmail, hashPassword(cleanPassword), role, active, now, now]
      );
      await client.query('commit');
      return { ok: true, userId, email: cleanEmail, role };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  const store = await readLocalStore();
  if (store.users.some((user) => user.email === cleanEmail)) return { ok: false, error: 'Account already exists' };

  let role: AuthRole = 'editor';
  let active = true;
  if (options?.createdByUserId) {
    const actor = findUserById(store.users, options.createdByUserId);
    if (!actor || !actor.active || actor.role !== 'admin') {
      return { ok: false, error: 'Only admin users can create team accounts' };
    }
    role = sanitizeRole(options.role);
    active = options.active !== false;
  } else {
    if (!isSelfSignupEnabled()) return { ok: false, error: 'Self signup is disabled' };
    role = store.users.length === 0 || isDefaultAdminEmail(cleanEmail) ? 'admin' : 'editor';
    active = true;
  }

  const now = new Date().toISOString();
  const userId = authUserIdFromEmail(cleanEmail);
  store.users.push({
    userId,
    email: cleanEmail,
    passwordHash: hashPassword(cleanPassword),
    role,
    active,
    createdAt: now,
    updatedAt: now
  });
  await writeLocalStore(store);
  return { ok: true, userId, email: cleanEmail, role };
}

export async function loginAuthUser(
  email: string,
  password: string
): Promise<{ ok: true; userId: string; email: string; role: AuthRole } | { ok: false; error: string }> {
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || '');
  if (!cleanEmail || !cleanPassword) return { ok: false, error: 'Missing credentials' };
  if (!isAllowedEmail(cleanEmail)) return { ok: false, error: 'Email is not allowed for this workspace' };

  const user = hasDatabase()
    ? await (async () => {
        await ensureSchema();
        const client = await getPool().connect();
        try {
          return await findDbUserByEmail(client, cleanEmail);
        } finally {
          client.release();
        }
      })()
    : (await readLocalStore()).users.find((item) => item.email === cleanEmail) || null;

  if (!user) return { ok: false, error: 'Invalid email or password' };
  if (!verifyPassword(cleanPassword, user.passwordHash)) return { ok: false, error: 'Invalid email or password' };
  if (!user.active) return { ok: false, error: 'Account is inactive. Contact admin.' };
  return { ok: true, userId: user.userId, email: user.email, role: user.role };
}

export async function getAuthUserById(userId: string): Promise<PublicAuthUser | null> {
  if (!userId) return null;
  if (hasDatabase()) {
    await ensureSchema();
    const client = await getPool().connect();
    try {
      const user = await findDbUserById(client, userId);
      return user ? toPublicUser(user) : null;
    } finally {
      client.release();
    }
  }

  const store = await readLocalStore();
  const user = findUserById(store.users, userId);
  return user ? toPublicUser(user) : null;
}

export async function listUsersForAdmin(
  adminUserId: string
): Promise<{ ok: true; users: PublicAuthUser[] } | { ok: false; error: string }> {
  const admin = await getAuthUserById(adminUserId);
  if (!admin || !admin.active || admin.role !== 'admin') return { ok: false, error: 'Admin access required' };

  if (hasDatabase()) {
    await ensureSchema();
    const client = await getPool().connect();
    try {
      return { ok: true, users: await listDbUsers(client) };
    } finally {
      client.release();
    }
  }

  const store = await readLocalStore();
  return {
    ok: true,
    users: [...store.users].map(toPublicUser).sort((a, b) => a.email.localeCompare(b.email))
  };
}

export async function updateUserByAdmin(
  adminUserId: string,
  targetUserId: string,
  patch: { role?: AuthRole; active?: boolean; password?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (hasDatabase()) {
    await ensureSchema();
    const client = await getPool().connect();
    try {
      await client.query('begin');
      const admin = await findDbUserById(client, adminUserId);
      if (!admin || !admin.active || admin.role !== 'admin') {
        await client.query('rollback');
        return { ok: false, error: 'Admin access required' };
      }
      const target = await findDbUserById(client, targetUserId);
      if (!target) {
        await client.query('rollback');
        return { ok: false, error: 'User not found' };
      }

      const nextRole = patch.role ? sanitizeRole(patch.role) : target.role;
      const nextActive = patch.active === undefined ? target.active : Boolean(patch.active);
      if (target.role === 'admin' && (!nextActive || nextRole !== 'admin') && (await countDbActiveAdmins(client)) <= 1) {
        await client.query('rollback');
        return { ok: false, error: 'At least one active admin is required' };
      }

      if (patch.password !== undefined && String(patch.password).length < 8) {
        await client.query('rollback');
        return { ok: false, error: 'Password must be at least 8 characters' };
      }

      await client.query(
        `update gemfinder_auth_users
         set role = $2, active = $3, password_hash = $4, updated_at = $5::timestamptz
         where user_id = $1`,
        [
          target.userId,
          nextRole,
          nextActive,
          patch.password ? hashPassword(String(patch.password)) : target.passwordHash,
          new Date().toISOString()
        ]
      );
      await client.query('commit');
      return { ok: true };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  const store = await readLocalStore();
  const admin = findUserById(store.users, adminUserId);
  if (!admin || !admin.active || admin.role !== 'admin') return { ok: false, error: 'Admin access required' };
  const index = store.users.findIndex((user) => user.userId === targetUserId);
  if (index < 0) return { ok: false, error: 'User not found' };
  const target = store.users[index];
  const nextRole = patch.role ? sanitizeRole(patch.role) : target.role;
  const nextActive = patch.active === undefined ? target.active : Boolean(patch.active);
  if (target.role === 'admin' && (!nextActive || nextRole !== 'admin') && countActiveAdmins(store.users) <= 1) {
    return { ok: false, error: 'At least one active admin is required' };
  }
  if (patch.password !== undefined && String(patch.password).length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters' };
  }

  store.users[index] = {
    ...target,
    role: nextRole,
    active: nextActive,
    passwordHash: patch.password ? hashPassword(String(patch.password)) : target.passwordHash,
    updatedAt: new Date().toISOString()
  };
  await writeLocalStore(store);
  return { ok: true };
}

export async function requestPasswordReset(
  email: string
): Promise<{ ok: true; token?: string; email: string; userId?: string; expiresAt?: string } | { ok: false; error: string }> {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !cleanEmail.includes('@')) return { ok: false, error: 'Invalid email' };
  if (!isAllowedEmail(cleanEmail)) return { ok: false, error: 'Email is not allowed for this workspace' };

  if (hasDatabase()) {
    await ensureSchema();
    const client = await getPool().connect();
    try {
      await client.query('begin');
      const user = await findDbUserByEmail(client, cleanEmail);
      if (!user || !user.active) {
        await client.query('rollback');
        return { ok: true, email: cleanEmail };
      }

      const token = crypto.randomBytes(20).toString('hex');
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 20).toISOString();
      await client.query('delete from gemfinder_password_reset_tokens where user_id = $1 or email = $2', [user.userId, user.email]);
      await client.query(
        `insert into gemfinder_password_reset_tokens (token, user_id, email, expires_at, created_at)
         values ($1, $2, $3, $4::timestamptz, $5::timestamptz)`,
        [token, user.userId, user.email, expiresAt, now]
      );
      await client.query('commit');
      return { ok: true, token, email: user.email, userId: user.userId, expiresAt };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  const store = await readLocalStore();
  const user = store.users.find((item) => item.email === cleanEmail);
  if (!user || !user.active) return { ok: true, email: cleanEmail };

  const token = crypto.randomBytes(20).toString('hex');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 20).toISOString();
  store.resetTokens = store.resetTokens.filter((item) => item.userId !== user.userId && item.email !== user.email);
  store.resetTokens.push({ token, userId: user.userId, email: user.email, createdAt: now, expiresAt });
  await writeLocalStore(store);
  return { ok: true, token, email: user.email, userId: user.userId, expiresAt };
}

export async function resetPassword(
  token: string,
  nextPassword: string
): Promise<{ ok: true; userId: string; email: string; role: AuthRole } | { ok: false; error: string }> {
  const cleanToken = String(token || '').trim();
  const cleanPassword = String(nextPassword || '');
  if (!cleanToken) return { ok: false, error: 'Missing reset token' };
  if (cleanPassword.length < 8) return { ok: false, error: 'Password must be at least 8 characters' };

  if (hasDatabase()) {
    await ensureSchema();
    const client = await getPool().connect();
    try {
      await client.query('begin');
      const tokenRes = await client.query('select * from gemfinder_password_reset_tokens where token = $1 limit 1', [cleanToken]);
      const hit = tokenRes.rows[0] ? mapDbResetToken(tokenRes.rows[0]) : null;
      if (!hit) {
        await client.query('rollback');
        return { ok: false, error: 'Reset token invalid or expired' };
      }
      if (new Date(hit.expiresAt).getTime() < Date.now()) {
        await client.query('delete from gemfinder_password_reset_tokens where token = $1', [cleanToken]);
        await client.query('commit');
        return { ok: false, error: 'Reset token invalid or expired' };
      }

      const user = await findDbUserById(client, hit.userId);
      if (!user || !user.active) {
        await client.query('delete from gemfinder_password_reset_tokens where token = $1', [cleanToken]);
        await client.query('commit');
        return { ok: false, error: 'Account not available' };
      }

      await client.query(
        `update gemfinder_auth_users
         set password_hash = $2, updated_at = $3::timestamptz
         where user_id = $1`,
        [user.userId, hashPassword(cleanPassword), new Date().toISOString()]
      );
      await client.query('delete from gemfinder_password_reset_tokens where token = $1', [cleanToken]);
      await client.query('commit');
      const updated = await getAuthUserById(user.userId);
      return updated ? { ok: true, userId: updated.userId, email: updated.email, role: updated.role } : { ok: false, error: 'Account not available' };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  const store = await readLocalStore();
  const hit = store.resetTokens.find((item) => item.token === cleanToken);
  if (!hit) return { ok: false, error: 'Reset token invalid or expired' };
  if (new Date(hit.expiresAt).getTime() < Date.now()) {
    store.resetTokens = store.resetTokens.filter((item) => item.token !== cleanToken);
    await writeLocalStore(store);
    return { ok: false, error: 'Reset token invalid or expired' };
  }

  const userIndex = store.users.findIndex((item) => item.userId === hit.userId && item.email === hit.email);
  if (userIndex < 0 || !store.users[userIndex].active) {
    store.resetTokens = store.resetTokens.filter((item) => item.token !== cleanToken);
    await writeLocalStore(store);
    return { ok: false, error: 'Account not available' };
  }

  store.users[userIndex] = {
    ...store.users[userIndex],
    passwordHash: hashPassword(cleanPassword),
    updatedAt: new Date().toISOString()
  };
  store.resetTokens = store.resetTokens.filter((item) => item.token !== cleanToken);
  await writeLocalStore(store);
  const user = store.users[userIndex];
  return { ok: true, userId: user.userId, email: user.email, role: user.role };
}
