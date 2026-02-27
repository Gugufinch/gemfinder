import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendMagicLinkEmail } from '@/lib/bonafied/magic-link';
import { createMagicToken } from '@/lib/bonafied/repository';

const schema = z.object({
  email: z.string().email().max(220)
});

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid email payload', details: parsed.error.issues }, { status: 400 });
  }

  const allowed = (process.env.AR_ALLOWED_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const email = parsed.data.email.toLowerCase();
  if (allowed.length > 0 && !allowed.includes(email)) {
    return NextResponse.json({ error: 'Email is not allowed for this workspace' }, { status: 403 });
  }

  const token = await createMagicToken(email);
  await sendMagicLinkEmail(email, token.token);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return NextResponse.json({
    ok: true,
    expiresAt: token.expiresAt,
    previewLink: `${baseUrl}/api/auth/verify?token=${token.token}`
  });
}
