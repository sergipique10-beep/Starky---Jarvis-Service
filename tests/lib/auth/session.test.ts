import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeSessionToken, isValidSessionToken, isValidPassword } from '@/lib/auth/session';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('session', () => {
  beforeEach(() => {
    process.env.APP_PASSWORD = 'correct-horse-battery-staple';
  });

  it('computes a stable token for the same password', () => {
    expect(computeSessionToken()).toBe(computeSessionToken());
  });

  it('computes a different token for a different password', () => {
    const tokenA = computeSessionToken();
    process.env.APP_PASSWORD = 'a-different-password';
    const tokenB = computeSessionToken();
    expect(tokenA).not.toBe(tokenB);
  });

  it('validates the correct session token', () => {
    expect(isValidSessionToken(computeSessionToken())).toBe(true);
  });

  it('rejects a wrong or missing session token', () => {
    expect(isValidSessionToken('not-the-right-token')).toBe(false);
    expect(isValidSessionToken(null)).toBe(false);
    expect(isValidSessionToken(undefined)).toBe(false);
  });

  it('validates the correct password', () => {
    expect(isValidPassword('correct-horse-battery-staple')).toBe(true);
  });

  it('rejects a wrong or missing password', () => {
    expect(isValidPassword('wrong')).toBe(false);
    expect(isValidPassword(null)).toBe(false);
  });

  it('throws computing a token when APP_PASSWORD is unset', () => {
    delete process.env.APP_PASSWORD;
    expect(() => computeSessionToken()).toThrow('Missing APP_PASSWORD');
  });
});
