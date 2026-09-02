export interface DisplayMessage {
  role: 'user' | 'assistant';
  text: string;
}

export default function MessageList({ messages }: { messages: DisplayMessage[] }) {
  return (
    <div>
      {messages.map((m, i) => (
        <p key={i}>
          <strong>{m.role === 'user' ? 'Vos' : 'Jarvis'}:</strong> {m.text}
        </p>
      ))}
    </div>
  );
}
