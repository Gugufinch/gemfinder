import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resetArPassword } from '@/lib/bonafied/repository';

const schema = z.object({
  token: z.string().min(1).max(200),
  password: z.string().min(8).max(120)
});

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid reset payload', details: parsed.error.issues }, { status: 400 });
  }

  const result = await resetArPassword(parsed.data.token, parsed.data.password);
  if (!result.ok) {
    const status = result.error === 'Reset token invalid or expired' ? 401 : 400;
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
