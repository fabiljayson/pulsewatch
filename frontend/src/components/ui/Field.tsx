import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

interface FieldShellProps {
  id: string;
  label: string;
  helper?: ReactNode;
  error?: string | null;
  children: (describedBy: string) => ReactNode;
}

function FieldShell({ id, label, helper, error, children }: FieldShellProps) {
  const describedBy = [helper ? `${id}-helper` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(describedBy)}
      {helper ? (
        <span className="helper" id={`${id}-helper`}>
          {helper}
        </span>
      ) : null}
      {error ? (
        <span className="error" id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  helper?: ReactNode;
  error?: string | null;
}

export function TextField({ id, label, helper, error, ...rest }: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} helper={helper} error={error}>
      {(describedBy) => (
        <input
          id={id}
          className="input"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          aria-errormessage={error ? `${id}-error` : undefined}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  id: string;
  label: string;
  helper?: ReactNode;
  error?: string | null;
}

export function SelectField({ id, label, helper, error, children, ...rest }: SelectFieldProps) {
  return (
    <FieldShell id={id} label={label} helper={helper} error={error}>
      {(describedBy) => (
        <select
          id={id}
          className="select"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          {...rest}
        >
          {children}
        </select>
      )}
    </FieldShell>
  );
}
