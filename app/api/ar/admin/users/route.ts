import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUserById, listUsersForAdmin, registerAuthUser } from '@/lib/gemfinder/auth-store';

const createSchema = z.object({
  email: z.string().email().max(220),
  role: z.enum(['admin', 'editor', 'viewer']).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(120).optional()
});

function tempPassword(): string {
  const seed = crypto.randomBytes(10).toString('base64url');
  return `${seed}A1!`;
}

export async function GET(req: NextRequest) {
  const adminUserId = req.cookies.get('ar_user')?.value || '';
  const actor = await getAuthUserById(adminUserId);
  if (!actor || !actor.active) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const result = await listUsersForAdmin(actor.userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }
  return NextResponse.json({ ok: true, users: result.users });
}

export async function POST(req: NextRequest) {
  const adminUserId = req.cookies.get('ar_user')?.value || '';
  const actor = await getAuthUserById(adminUserId);
  if (!actor || !actor.active) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const payload = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid user payload', details: parsed.error.issues }, { status: 400 });
  }

  const generated = !parsed.data.password;
  const password = parsed.data.password || tempPassword();
  const result = await registerAuthUser(parsed.data.email, password, {
    createdByUserId: actor.userId,
    role: parsed.data.role,
    active: parsed.data.active
  });
  if (!result.ok) {
    const status = result.error === 'Account already exists' ? 409 : result.error.includes('admin') ? 403 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    user: { userId: result.userId, email: result.email, role: result.role },
    generatedPassword: generated ? password : undefined
  });
}
