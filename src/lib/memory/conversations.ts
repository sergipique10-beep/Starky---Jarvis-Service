import { getSupabaseClient } from '@/lib/supabase/client';
import type { ConversationMessage } from './types';

export async function getOrCreateDefaultConversation(): Promise<string> {
  const client = getSupabaseClient();

  const { data: existing, error: selectError } = await client
    .from('conversations')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selectError) throw new Error(`Failed to fetch conversations: ${selectError.message}`);
  if (existing) return existing.id;

  const { data: created, error: insertError } = await client
    .from('conversations')
    .insert({})
    .select('id')
    .single();
  if (insertError) throw new Error(`Failed to create conversation: ${insertError.message}`);
  return created.id;
}

export async function appendMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'summary',
  content: string
): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.from('messages').insert({ conversation_id: conversationId, role, content });
  if (error) throw new Error(`Failed to append message: ${error.message}`);
}

export async function getRecentMessages(conversationId: string, limit: number): Promise<ConversationMessage[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to fetch messages: ${error.message}`);
  return (data ?? []).reverse();
}

export async function summarizeOldMessages(
  conversationId: string,
  keepLast: number,
  summarize: (text: string) => Promise<string>
): Promise<void> {
  const client = getSupabaseClient();
  const all = await getRecentMessages(conversationId, 1000);
  if (all.length <= keepLast) return;

  const toSummarize = all.slice(0, all.length - keepLast);
  const text = toSummarize.map((m) => `${m.role}: ${m.content}`).join('\n');
  const summaryText = await summarize(text);

  const { error: insertError } = await client
    .from('messages')
    .insert({ conversation_id: conversationId, role: 'summary', content: summaryText });
  if (insertError) throw new Error(`Failed to insert summary: ${insertError.message}`);
}
