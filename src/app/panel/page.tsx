import PanelClient from '@/components/panel/PanelClient';
import { TOOLS } from '@/lib/tools/registry';
import { getRecentAuditLog } from '@/lib/tools/audit';

// Same reasoning as src/app/page.tsx: this reads live data (the audit log)
// on every request, so it must never be statically prerendered.
export const dynamic = 'force-dynamic';

export default async function PanelPage() {
  const auditLog = await getRecentAuditLog(20).catch(() => []);
  const tools = TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    riskLevel: t.riskLevel,
    inputSchema: t.inputSchema as any,
  }));

  return <PanelClient tools={tools} initialAuditLog={auditLog} />;
}
