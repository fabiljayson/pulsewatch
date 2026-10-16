export function Spinner({ label }: { label?: string }) {
  return (
    <span className="spinner" role={label ? "status" : undefined}>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
