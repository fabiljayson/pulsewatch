export interface SegmentedOption<T> {
  value: T;
  label: string;
  title?: string;
}

export interface SegmentedProps<T> {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  testId?: string;
}

/** Button group for small discrete choices (reporting windows, granularities). */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  testId,
}: SegmentedProps<T>) {
  return (
    <div className="segmented-group">
      <span className="segmented__label" id={`segmented-${label.replace(/\W+/g, "-")}`}>
        {label}
      </span>
      <div
        className="segmented"
        role="group"
        aria-labelledby={`segmented-${label.replace(/\W+/g, "-")}`}
        data-testid={testId}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            title={option.title}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
