import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      ssh_host: 'host.example.com',
      ssh_port: 22,
      ssh_username: 'deploy',
      encrypted_private_key: 'cipher-b64',
      encryption_iv: 'iv-b64',
      encryption_auth_tag: 'tag-b64',
    },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ upsert, select });
  return { getSupabaseClient: () => ({ from }) };
});

vi.mock('@/lib/security/credentials', () => ({
  encryptSecret: vi.fn().mockReturnValue({ ciphertext: 'cipher-b64', iv: 'iv-b64', authTag: 'tag-b64' }),
  decryptSecret: vi.fn().mockReturnValue('-----BEGIN KEY-----'),
}));

import { saveSiteCredentials, getSiteCredentials } from '@/lib/memory/siteCredentials';
import { getSupabaseClient } from '@/lib/supabase/client';
import { encryptSecret } from '@/lib/security/credentials';

describe('site credentials memory', () => {
  it('encrypts the private key before upserting', async () => {
    await saveSiteCredentials('W1', {
      host: 'host.example.com',
      port: 22,
      username: 'deploy',
      privateKey: '-----BEGIN KEY-----',
    });

    expect(encryptSecret).toHaveBeenCalledWith('-----BEGIN KEY-----');
    const client = getSupabaseClient() as any;
    expect(client.from).toHaveBeenCalledWith('site_credentials');
    expect(client.from.mock.results[0].value.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_name: 'W1',
        ssh_host: 'host.example.com',
        ssh_port: 22,
        ssh_username: 'deploy',
        encrypted_private_key: 'cipher-b64',
        encryption_iv: 'iv-b64',
        encryption_auth_tag: 'tag-b64',
      }),
      { onConflict: 'project_name' }
    );
  });

  it('decrypts the private key after fetching', async () => {
    const creds = await getSiteCredentials('W1');
    expect(creds).toEqual({
      host: 'host.example.com',
      port: 22,
      username: 'deploy',
      privateKey: '-----BEGIN KEY-----',
    });
  });

  it('returns null when no credentials are registered for the site', async () => {
    const client = getSupabaseClient() as any;
    client.from.mockReturnValueOnce({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    });
    const creds = await getSiteCredentials('UNKNOWN');
    expect(creds).toBeNull();
  });
});
