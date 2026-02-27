import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set('bonafied_user', '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  response.cookies.set('bonafied_email', '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  return response;
}
