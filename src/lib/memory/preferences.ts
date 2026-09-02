import { getSupabaseClient } from '@/lib/supabase/client';

export async function getPreferences(): Promise<Record<string, string>> {
  const client = getSupabaseClient();
  const { data, error } = await client.from('preferences').select('key, value');
  if (error) throw new Error(`Failed to fetch preferences: ${error.message}`);
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return map;
}

export async function setPreference(key: string, value: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.from('preferences').upsert({ key, value });
  if (error) throw new Error(`Failed to set preference: ${error.message}`);
}
