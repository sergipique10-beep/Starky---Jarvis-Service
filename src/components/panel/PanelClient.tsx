'use client';

import { useState } from 'react';
import ToolCard, { type ToolSummary } from './ToolCard';
import AuditLogList from './AuditLogList';
import ConfirmationBanner from '@/components/chat/ConfirmationBanner';
import type { AuditLogRow } from '@/lib/tools/audit';
import styles from './PanelClient.module.css';

interface PendingConfirmation {
  pendingId: string;
  toolName: string;
  summary: string;
}

export default function PanelClient({
  tools,
  initialAuditLog,
}: {
  tools: ToolSummary[];
  initialAuditLog: AuditLogRow[];
}) {
  const [results, setResults] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [busyTool, setBusyTool] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState(initialAuditLog);

  function applyResult(toolName: string, data: any) {
    if (data.type === 'confirmation_required') {
      setPending({ pendingId: data.pendingId, toolName: data.toolName, summary: data.summary });
      return;
    }
    setResults((prev) => ({ ...prev, [toolName]: data.text }));
    setErrors((prev) => ({ ...prev, [toolName]: '' }));
  }

  async function runTool(toolName: string, input: Record<string, unknown>) {
    setBusyTool(toolName);
    try {
      const res = await fetch('/api/tools/execute', {
        method: 'POST',
        body: JSON.stringify({ toolName, input }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setErrors((prev) => ({ ...prev, [toolName]: data?.error || 'No se pudo ejecutar la herramienta.' }));
        return;
      }
      const data = await res.json();
      applyResult(toolName, data);
    } catch {
      setErrors((prev) => ({ ...prev, [toolName]: 'No se pudo ejecutar la herramienta.' }));
    } finally {
      setBusyTool(null);
    }
  }

  async function confirm(confirmed: boolean) {
    if (!pending) return;
    const { pendingId, toolName } = pending;
    setBusyTool(toolName);
    try {
      const res = await fetch('/api/confirm', {
        method: 'POST',
        body: JSON.stringify({ pendingId, confirmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setPending(null);
        setErrors((prev) => ({ ...prev, [toolName]: data?.error || 'No se pudo confirmar la acción.' }));
        return;
      }
      const data = await res.json();
      setPending(null);
      applyResult(toolName, data);
    } catch {
      setErrors((prev) => ({ ...prev, [toolName]: 'No se pudo confirmar la acción.' }));
    } finally {
      setBusyTool(null);
    }
  }

  return (
    <div className={styles.page}>
      <span className={styles.title}>Panel de herramientas</span>

      <div className={styles.grid}>
        {tools.map((tool) => (
          <ToolCard
            key={tool.name}
            tool={tool}
            onSubmit={runTool}
            disabled={busyTool === tool.name}
            resultMessage={results[tool.name] || null}
            errorMessage={errors[tool.name] || null}
          />
        ))}
      </div>

      {pending && (
        <ConfirmationBanner
          summary={pending.summary}
          onConfirm={() => confirm(true)}
          onCancel={() => confirm(false)}
        />
      )}

      <div>
        <p className={styles.sectionTitle}>Historial reciente</p>
        <AuditLogList rows={auditLog} />
      </div>
    </div>
  );
}
