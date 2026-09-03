import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'jarvis_session';

// Single-user app: the session token is just an HMAC of a fixed string keyed
// by APP_PASSWORD, so a valid cookie can only be produced by someone who
// already knows the password — no separate session store needed.
export function computeSessionToken(): string {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    throw new Error('Missing APP_PASSWORD');
  }
  return createHmac('sha256', password).update('jarvis-session').digest('hex');
}

export function isValidSessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  let expected: string;
  try {
    expected = computeSessionToken();
  } catch {
    return false;
  }
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isValidPassword(password: string | undefined | null): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected || !password) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
