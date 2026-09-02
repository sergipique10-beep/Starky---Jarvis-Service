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
    <div role="alert">
      <p>{summary}</p>
      <button onClick={onConfirm}>Confirmar</button>
      <button onClick={onCancel}>Cancelar</button>
    </div>
  );
}
