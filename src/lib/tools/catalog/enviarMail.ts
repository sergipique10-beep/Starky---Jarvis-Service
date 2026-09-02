import type { ToolDefinition } from '../types';

export interface EmailSender {
  send(to: string, subject: string, body: string): Promise<void>;
}

const logOnlySender: EmailSender = {
  async send(to, subject, body) {
    console.log(`[enviar_mail:MVP] to=${to} subject="${subject}" body="${body}"`);
  },
};

let currentSender: EmailSender = logOnlySender;

export function setEmailSender(sender: EmailSender): void {
  currentSender = sender;
}

export const enviarMail: ToolDefinition = {
  name: 'enviar_mail',
  description: 'Envía un mail en nombre del usuario. Acción irreversible con impacto externo.',
  riskLevel: 3,
  inputSchema: {
    type: 'object',
    properties: {
      to: { type: 'string' },
      subject: { type: 'string' },
      body: { type: 'string' },
    },
    required: ['to', 'subject', 'body'],
  },
  async execute(input, _ctx) {
    const { to, subject, body } = input as { to: string; subject: string; body: string };
    await currentSender.send(to, subject, body);
    return { success: true, message: `Mail enviado a ${to}.` };
  },
};
