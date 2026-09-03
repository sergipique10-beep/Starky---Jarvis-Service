import type { AuditLogRow } from '@/lib/tools/audit';
import styles from './AuditLogList.module.css';

export default function AuditLogList({ rows }: { rows: AuditLogRow[] }) {
  if (rows.length === 0) {
    return <p className={styles.empty}>Todavía no se ejecutó ninguna acción.</p>;
  }

  return (
    <div className={styles.list}>
      {rows.map((row) => (
        <div key={row.id} className={styles.row}>
          <span className={styles.tool}>{row.tool_name}</span>
          <span className={`${styles.message} ${row.result.success ? '' : styles.error}`}>
            {row.result.message}
          </span>
        </div>
      ))}
    </div>
  );
}
