type Props = {
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
};

export function StatusButton({ label, onClick, disabled, variant = 'primary' }: Props) {
  const cls = variant === 'primary' ? 'btn btn-primary status-btn' : 'btn status-btn';
  return (
    <button type="button" className={cls} disabled={disabled} onClick={() => void onClick()}>
      {label}
    </button>
  );
}
