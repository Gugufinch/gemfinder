import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requestPasswordReset } from '@/lib/gemfinder/auth-store';
import { sendPasswordResetEmail } from '@/lib/gemfinder/email';

const schema = z.object({
  email: z.string().email().max(220)
});

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid reset request payload', details: parsed.error.issues }, { status: 400 });
  }

  const result = await requestPasswordReset(parsed.data.email);
  if (!result.ok) {
    const status = result.error === 'Email is not allowed for this workspace' ? 403 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  if (result.token) {
    await sendPasswordResetEmail(result.email, result.token);
  }

  const response: Record<string, unknown> = {
    ok: true,
    message: 'If the account exists, a reset link has been generated.'
  };

  if (result.token && process.env.NODE_ENV !== 'production') {
    response.previewLink = `${baseUrl}/ar?resetToken=${encodeURIComponent(result.token)}`;
    response.expiresAt = result.expiresAt;
  }

  return NextResponse.json(response);
}
