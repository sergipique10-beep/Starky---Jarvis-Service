import { getSupabaseClient } from '@/lib/supabase/client';
import type { ProjectRecord } from './types';

export async function getProject(name: string): Promise<ProjectRecord | null> {
  const client = getSupabaseClient();
  const { data, error } = await client.from('projects').select('name, status, description').eq('name', name).maybeSingle();
  if (error) throw new Error(`Failed to fetch project: ${error.message}`);
  return data ?? null;
}

export async function upsertProject(record: ProjectRecord): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.from('projects').upsert(record, { onConflict: 'name' });
  if (error) throw new Error(`Failed to upsert project: ${error.message}`);
}

export async function listRecentProjects(limit: number): Promise<ProjectRecord[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('projects')
    .select('name, status, description')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to list projects: ${error.message}`);
  return data ?? [];
}
