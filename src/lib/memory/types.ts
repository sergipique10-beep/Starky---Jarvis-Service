export interface ProjectRecord {
  name: string;
  status: string;
  description: string | null;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'summary';
  content: string;
  created_at: string;
}
