import { describe, it, expect, beforeEach } from 'vitest';
import { encryptSecret, decryptSecret } from '@/lib/security/credentials';

beforeEach(() => {
  process.env.CREDENTIALS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('credentials encryption', () => {
  it('round-trips a secret through encrypt and decrypt', () => {
    const payload = encryptSecret('-----BEGIN RSA PRIVATE KEY-----\nabc123\n-----END-----');
    expect(payload.ciphertext).not.toContain('BEGIN RSA PRIVATE KEY');

    const plaintext = decryptSecret(payload);
    expect(plaintext).toBe('-----BEGIN RSA PRIVATE KEY-----\nabc123\n-----END-----');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptSecret('same-secret');
    const b = encryptSecret('same-secret');
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('throws when CREDENTIALS_MASTER_KEY is missing', () => {
    delete process.env.CREDENTIALS_MASTER_KEY;
    expect(() => encryptSecret('x')).toThrow();
  });
});
