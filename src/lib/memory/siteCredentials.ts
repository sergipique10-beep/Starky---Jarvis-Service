import { getSupabaseClient } from '@/lib/supabase/client';
import { encryptSecret, decryptSecret } from '@/lib/security/credentials';

export interface SiteCredentials {
  host: string;
  port: number;
  username: string;
  privateKey: string;
}

// NOTE: This function currently has no production caller. The SSH/database-audit feature
// (gatherWpCliInventory via getSiteCredentials) is inert in practice until a credential-
// registration entry point exists — a future risk-level-3 tool, intentionally not built as
// part of this dispatch.
export async function saveSiteCredentials(projectName: string, creds: SiteCredentials): Promise<void> {
  const payload = encryptSecret(creds.privateKey);
  const client = getSupabaseClient();
  const { error } = await client.from('site_credentials').upsert(
    {
      project_name: projectName,
      ssh_host: creds.host,
      ssh_port: creds.port,
      ssh_username: creds.username,
      encrypted_private_key: payload.ciphertext,
      encryption_iv: payload.iv,
      encryption_auth_tag: payload.authTag,
    },
    { onConflict: 'project_name' }
  );
  if (error) throw new Error(`Failed to save site credentials: ${error.message}`);
}

export async function getSiteCredentials(projectName: string): Promise<SiteCredentials | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('site_credentials')
    .select('ssh_host, ssh_port, ssh_username, encrypted_private_key, encryption_iv, encryption_auth_tag')
    .eq('project_name', projectName)
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch site credentials: ${error.message}`);
  if (!data) return null;

  const privateKey = decryptSecret({
    ciphertext: data.encrypted_private_key,
    iv: data.encryption_iv,
    authTag: data.encryption_auth_tag,
  });

  return {
    host: data.ssh_host,
    port: data.ssh_port,
    username: data.ssh_username,
    privateKey,
  };
}
