import { describe, it, expect, vi } from 'vitest';
import { enviarMail, setEmailSender } from '@/lib/tools/catalog/enviarMail';

describe('enviar_mail', () => {
  it('is risk level 3 (irreversible, external impact)', () => {
    expect(enviarMail.riskLevel).toBe(3);
  });

  it('delegates to the configured EmailSender and reports success', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    setEmailSender({ send });

    const result = await enviarMail.execute(
      { to: 'juan@mail.com', subject: 'Reporte', body: 'Adjunto el reporte.' },
      { conversationId: 'c1' }
    );

    expect(send).toHaveBeenCalledWith('juan@mail.com', 'Reporte', 'Adjunto el reporte.');
    expect(result.success).toBe(true);
  });
});
