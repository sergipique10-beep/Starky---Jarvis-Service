import styles from './MessageList.module.css';

export interface DisplayMessage {
  role: 'user' | 'assistant';
  text: string;
}

export default function MessageList({
  messages,
  userName,
}: {
  messages: DisplayMessage[];
  userName: string;
}) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className={styles.list}>
      {messages.map((m, i) => (
        <div key={i} className={`${styles.row} ${m.role === 'user' ? styles.rowUser : styles.rowAssistant}`}>
          <div className={`${styles.bubble} ${m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant}`}>
            <span className={styles.label}>{m.role === 'user' ? userName : 'Jarvis'}</span>
            {m.text}
          </div>
        </div>
      ))}
    </div>
  );
}
