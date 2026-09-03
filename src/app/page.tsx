import ChatWindow from '@/components/chat/ChatWindow';
import { getOrCreateDefaultConversation } from '@/lib/memory/conversations';
import { getPreferences } from '@/lib/memory/preferences';

// This page talks to Supabase on every load (it ensures a conversation row
// exists and reads its id), so it must never be statically prerendered —
// there is no build-time database connection, and the conversation must
// reflect live state per request.
export const dynamic = 'force-dynamic';

export default async function Home() {
  const [conversationId, preferences] = await Promise.all([
    getOrCreateDefaultConversation(),
    getPreferences(),
  ]);
  const userName = preferences.nombre_usuario ?? 'Vos';
  return <ChatWindow conversationId={conversationId} userName={userName} />;
}
