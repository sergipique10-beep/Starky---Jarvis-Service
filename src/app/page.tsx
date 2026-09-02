import ChatWindow from '@/components/chat/ChatWindow';

export default function Home() {
  const conversationId = 'default-conversation';
  return <ChatWindow conversationId={conversationId} />;
}
