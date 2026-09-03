import { NextResponse } from 'next/server';
import { computeSessionToken, isValidPassword, SESSION_COOKIE } from '@/lib/auth/session';

export async function POST(req: Request) {
  const { password } = await req.json();

  if (!isValidPassword(password)) {
    return NextResponse.json({ success: false, message: 'Contraseña incorrecta.' }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, computeSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return response;
}
