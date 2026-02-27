import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { loginArUser } from '@/lib/bonafied/repository';

const schema = z.object({
  email: z.string().email().max(220),
  password: z.string().min(1).max(120)
});

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid login payload', details: parsed.error.issues }, { status: 400 });
  }

  const result = await loginArUser(parsed.data.email, parsed.data.password);
  if (!result.ok) {
    const status = result.error === 'Email is not allowed for this workspace' ? 403 : 401;
    return NextResponse.json({ error: result.error }, { status });
  }

  const secure = process.env.NODE_ENV === 'production';
  const response = NextResponse.json({ ok: true, userId: result.userId, email: result.email, role: result.role });
  response.cookies.set('ar_user', result.userId, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  });
  response.cookies.set('ar_email', result.email, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  });
  response.cookies.set('ar_role', result.role, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  });

  return response;
}
