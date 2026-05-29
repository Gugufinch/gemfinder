import { NextRequest, NextResponse } from 'next/server';
import { consumeMagicToken } from '@/lib/bonafied/repository';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const session = await consumeMagicToken(token);
  if (!session) {
    return NextResponse.json({ error: 'Token invalid or expired' }, { status: 401 });
  }

  const destination = new URL('/ar', req.url);
  const response = NextResponse.redirect(destination);
  const secure = process.env.NODE_ENV === 'production';
  response.cookies.set('bonafied_user', session.userId, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  });
  response.cookies.set('bonafied_email', session.email, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  });

  return response;
}
