import { Button } from "./Button";

export interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
  itemLabel?: string;
}

export function Pagination({ total, limit, offset, onChange, itemLabel = "items" }: PaginationProps) {
  if (total === 0) return null;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  const canPrev = offset > 0;
  const canNext = to < total;

  if (total <= limit && offset === 0) {
    return (
      <p className="pagination" aria-live="polite">
        {total} {total === 1 ? itemLabel.replace(/s$/, "") : itemLabel}
      </p>
    );
  }

  return (
    <nav className="pagination" aria-label="Pagination">
      <span aria-live="polite">
        {from}–{to} of {total} {itemLabel}
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={!canPrev}
        onClick={() => onChange(Math.max(0, offset - limit))}
        aria-label="Previous page"
      >
        ← Prev
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={!canNext}
        onClick={() => onChange(offset + limit)}
        aria-label="Next page"
      >
        Next →
      </Button>
    </nav>
  );
}
