import { getSupabaseClient } from '@/lib/supabase/client';
import type { RiskLevel, ToolResult } from './types';

export async function logToolExecution(
  toolName: string,
  riskLevel: RiskLevel,
  input: unknown,
  result: ToolResult
): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.from('audit_log').insert({
    tool_name: toolName,
    risk_level: riskLevel,
    input,
    result,
  });
  if (error) throw new Error(`Failed to write audit log: ${error.message}`);
}

export interface AuditLogRow {
  id: string;
  tool_name: string;
  risk_level: number;
  input: unknown;
  result: { success: boolean; message: string };
  created_at: string;
}

export async function getRecentAuditLog(limit: number): Promise<AuditLogRow[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('audit_log')
    .select('id, tool_name, risk_level, input, result, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to fetch audit log: ${error.message}`);
  return data ?? [];
}
