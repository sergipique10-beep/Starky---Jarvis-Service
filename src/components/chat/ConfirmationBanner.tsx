import styles from './ConfirmationBanner.module.css';

export default function ConfirmationBanner({
  summary,
  onConfirm,
  onCancel,
}: {
  summary: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="alert" className={styles.banner}>
      <p className={styles.summary}>{summary}</p>
      <div className={styles.actions}>
        <button className={styles.confirmButton} onClick={onConfirm}>
          Confirmar
        </button>
        <button className={styles.cancelButton} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
