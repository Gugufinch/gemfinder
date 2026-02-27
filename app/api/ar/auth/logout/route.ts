import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set('ar_user', '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  response.cookies.set('ar_email', '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  response.cookies.set('ar_role', '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  return response;
}
