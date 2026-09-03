import DynamicForm, { type ToolInputSchema } from './DynamicForm';
import styles from './ToolCard.module.css';

export interface ToolSummary {
  name: string;
  description: string;
  riskLevel: 1 | 2 | 3;
  inputSchema: ToolInputSchema;
}

const RISK_BADGE_CLASS = { 1: 'badgeLow', 2: 'badgeMedium', 3: 'badgeHigh' } as const;
const RISK_LABEL = { 1: 'Riesgo 1 · lectura', 2: 'Riesgo 2 · reversible', 3: 'Riesgo 3 · confirmación' } as const;

export default function ToolCard({
  tool,
  onSubmit,
  disabled,
  resultMessage,
  errorMessage,
}: {
  tool: ToolSummary;
  onSubmit: (toolName: string, input: Record<string, unknown>) => void;
  disabled?: boolean;
  resultMessage?: string | null;
  errorMessage?: string | null;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.name}>{tool.name}</span>
        <span className={`${styles.badge} ${styles[RISK_BADGE_CLASS[tool.riskLevel]]}`}>
          {RISK_LABEL[tool.riskLevel]}
        </span>
      </div>
      <p className={styles.description}>{tool.description}</p>
      <DynamicForm
        schema={tool.inputSchema}
        onSubmit={(values) => onSubmit(tool.name, values)}
        submitLabel="Ejecutar"
        disabled={disabled}
      />
      {resultMessage && <p className={styles.result}>{resultMessage}</p>}
      {errorMessage && <p className={styles.error}>{errorMessage}</p>}
    </div>
  );
}
