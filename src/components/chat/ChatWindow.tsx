'use client';

import { useRef, useState, useEffect } from 'react';
import MessageList, { type DisplayMessage } from './MessageList';
import MessageInput from './MessageInput';
import ConfirmationBanner from './ConfirmationBanner';
import Orb, { type OrbState } from '../orb/Orb';
import { useSpeechSynthesis } from '@/hooks/useSpeechSynthesis';

interface PendingConfirmation {
  pendingId: string;
  summary: string;
}

export default function ChatWindow({ conversationId }: { conversationId: string }) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [isListening, setIsListening] = useState(false);
  const { speak } = useSpeechSynthesis();
  const requestIdRef = useRef(0);

  // Update orbState based on listening state, unless overridden by thinking/speaking
  useEffect(() => {
    if (isListening) {
      setOrbState('listening');
    } else if (orbState !== 'thinking' && orbState !== 'speaking') {
      setOrbState('idle');
    }
  }, [isListening]);

  async function send(text: string) {
    setMessages((prev) => [...prev, { role: 'user', text }]);
    const myRequestId = ++requestIdRef.current;
    setOrbState('thinking');
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ conversationId, text }),
      });
      const data = await res.json();
      if (myRequestId !== requestIdRef.current) return; // stale response, a newer request superseded this one
      applyResponse(data);
    } catch (error) {
      console.error('Error sending message:', error);
      // Ensure orbState is reset even if fetch fails
      setOrbState('idle');
    }
  }

  async function confirm(confirmed: boolean) {
    if (!pending) return;
    const myRequestId = ++requestIdRef.current;
    setOrbState('thinking');
    try {
      const res = await fetch('/api/confirm', {
        method: 'POST',
        body: JSON.stringify({ pendingId: pending.pendingId, confirmed }),
      });
      const data = await res.json();
      if (myRequestId !== requestIdRef.current) return; // stale response, a newer request superseded this one
      setPending(null);
      applyResponse(data);
    } catch (error) {
      console.error('Error confirming:', error);
      // Ensure orbState is reset even if fetch fails
      setOrbState('idle');
    }
  }

  function applyResponse(data: any) {
    if (data.type === 'confirmation_required') {
      setPending({ pendingId: data.pendingId, summary: data.summary });
      setOrbState('idle');
    } else {
      setMessages((prev) => [...prev, { role: 'assistant', text: data.text }]);
      // Voice-safety rule: only ever speak a plain assistant message, never the
      // confirmation summary (that always stays on-screen text via ConfirmationBanner).
      speak(
        data.text,
        () => setOrbState('speaking'),
        () => setOrbState('idle')
      );
    }
  }

  return (
    <div>
      <Orb state={orbState} />
      <MessageList messages={messages} />
      {pending && (
        <ConfirmationBanner
          summary={pending.summary}
          onConfirm={() => confirm(true)}
          onCancel={() => confirm(false)}
        />
      )}
      <MessageInput onSend={send} onListeningChange={setIsListening} />
    </div>
  );
}
