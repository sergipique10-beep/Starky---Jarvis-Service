'use client';

import { useState } from 'react';
import MessageList, { type DisplayMessage } from './MessageList';
import MessageInput from './MessageInput';
import ConfirmationBanner from './ConfirmationBanner';

interface PendingConfirmation {
  pendingId: string;
  summary: string;
}

export default function ChatWindow({ conversationId }: { conversationId: string }) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);

  async function send(text: string) {
    setMessages((prev) => [...prev, { role: 'user', text }]);
    const res = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ conversationId, text }),
    });
    const data = await res.json();
    applyResponse(data);
  }

  async function confirm(confirmed: boolean) {
    if (!pending) return;
    const res = await fetch('/api/confirm', {
      method: 'POST',
      body: JSON.stringify({ pendingId: pending.pendingId, confirmed }),
    });
    const data = await res.json();
    setPending(null);
    applyResponse(data);
  }

  function applyResponse(data: any) {
    if (data.type === 'confirmation_required') {
      setPending({ pendingId: data.pendingId, summary: data.summary });
    } else {
      setMessages((prev) => [...prev, { role: 'assistant', text: data.text }]);
    }
  }

  return (
    <div>
      <MessageList messages={messages} />
      {pending && (
        <ConfirmationBanner
          summary={pending.summary}
          onConfirm={() => confirm(true)}
          onCancel={() => confirm(false)}
        />
      )}
      <MessageInput onSend={send} />
    </div>
  );
}
