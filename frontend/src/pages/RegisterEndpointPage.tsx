import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError, messageFromDetail } from "../api/client";
import { useApiContext } from "../api/ApiProvider";
import { useAction } from "../hooks";
import { PageHeader } from "../components/layout";
import { Button, Card, Notice, TextField } from "../components/ui";

interface FieldErrors {
  name?: string;
  url?: string;
}

function validateName(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a display name for this endpoint.";
  if (trimmed.length > 100) return "Name must be 100 characters or fewer.";
  return undefined;
}

function validateUrl(url: string): string | undefined {
  const trimmed = url.trim();
  if (!trimmed) return "Enter the URL to monitor.";
  if (trimmed.length > 2048) return "URL must be 2048 characters or fewer.";
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "Enter an absolute URL, for example https://example.com/health.";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Only http:// and https:// URLs can be monitored.";
  }
  if (parsed.username || parsed.password) {
    return "URLs containing credentials are not allowed.";
  }
  return undefined;
}

/** Map FastAPI 422 issue lists back onto the fields they belong to. */
function splitApiError(error: ApiError): { fields: FieldErrors; form?: string } {
  const fields: FieldErrors = {};
  const messages: string[] = [];
  const detail = error.detail;
  if (Array.isArray(detail)) {
    for (const issue of detail) {
      const location =
        issue && typeof issue === "object" && "loc" in issue && Array.isArray(issue.loc)
          ? issue.loc
          : [];
      const field = String(location[location.length - 1] ?? "");
      const msg =
        issue && typeof issue === "object" && "msg" in issue
          ? String((issue as { msg: unknown }).msg)
          : messageFromDetail(issue);
      if (field === "name" || field === "url") fields[field] = msg;
      else messages.push(msg);
    }
  }
  if (Object.keys(fields).length === 0 && messages.length === 0) {
    return { fields, form: error.message };
  }
  return { fields, form: messages.length ? messages.join(" · ") : undefined };
}

export function RegisterEndpointPage() {
  const { api, demo } = useApiContext();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const create = useAction(async () => api.createEndpoint({ name: name.trim(), url: url.trim(), is_active: isActive }));

  const onNameChange = (value: string) => {
    setName(value);
    if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: validateName(value) }));
  };

  const onUrlChange = (value: string) => {
    setUrl(value);
    if (fieldErrors.url) setFieldErrors((prev) => ({ ...prev, url: validateUrl(value) }));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const errors: FieldErrors = {};
    const nameError = validateName(name);
    const urlError = validateUrl(url);
    if (nameError) errors.name = nameError;
    if (urlError) errors.url = urlError;
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || create.busy) return;

    try {
      const endpoint = await create.run();
      if (!endpoint) return;
      navigate(`/endpoints/${endpoint.id}`, {
        replace: true,
        state: { created: true, name: endpoint.name },
      });
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (Array.isArray(caught.detail)) {
          const split = splitApiError(caught);
          setFieldErrors(split.fields);
          setFormError(split.form ?? null);
        } else {
          setFormError(caught.message);
        }
      } else {
        setFormError("Registration failed. Check your connection and try again.");
      }
    }
  };

  const onBlurName = () => setFieldErrors((prev) => ({ ...prev, name: validateName(name) }));
  const onBlurUrl = () => setFieldErrors((prev) => ({ ...prev, url: validateUrl(url) }));

  return (
    <>
      <PageHeader
        title="Register endpoint"
        subtitle="Add an HTTP/HTTPS endpoint to start recording health checks."
        actions={
          <Link className="btn btn--ghost" to="/endpoints">
            Cancel
          </Link>
        }
      />

      <div className="register-layout">
        <Card title="Endpoint details" className="register-card">
          {demo ? (
            <Notice tone="warning">
              Sample data mode is on: this form would write to the real store and the API rejects
              changes while sample data is displayed. Exit sample data first.
            </Notice>
          ) : null}
          <form onSubmit={onSubmit} noValidate>
            <div className="stack">
              <TextField
                id="endpoint-name"
                label="Display name"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                onBlur={onBlurName}
                placeholder="Payments API"
                maxLength={100}
                autoComplete="off"
                required
                error={fieldErrors.name}
                helper="How this endpoint appears in tables, charts, and reports. 1–100 characters."
                disabled={create.busy}
              />
              <TextField
                id="endpoint-url"
                label="URL"
                type="url"
                inputMode="url"
                value={url}
                onChange={(event) => onUrlChange(event.target.value)}
                onBlur={onBlurUrl}
                placeholder="https://example.com/health"
                maxLength={2048}
                autoComplete="off"
                required
                error={fieldErrors.url}
                helper="Absolute http:// or https:// address. Only public destinations are allowed; credentials in URLs are rejected."
                disabled={create.busy}
              />
              <label className="checkbox-field" htmlFor="endpoint-active">
                <input
                  id="endpoint-active"
                  type="checkbox"
                  checked={isActive}
                  onChange={(event) => setIsActive(event.target.checked)}
                  disabled={create.busy}
                />
                <span>
                  <span className="checkbox-field__label">Active</span>
                  <span className="helper">
                    Active endpoints accept manual health checks. Inactive endpoints are kept with
                    their history but return 409 when checked.
                  </span>
                </span>
              </label>

              {formError ? (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              ) : null}

              <div className="row">
                <Button
                  type="submit"
                  variant="primary"
                  loading={create.busy}
                  data-testid="register-submit"
                >
                  Register endpoint
                </Button>
                <Link className="btn btn--ghost" to="/endpoints">
                  Cancel
                </Link>
              </div>
            </div>
          </form>
        </Card>

        <Card variant="compact" title="What happens next">
          <ul className="plain-list">
            <li>
              <strong>On-demand checks.</strong> PulseWatch has no background scheduler: run checks
              manually from the endpoint page or in bulk from the overview.
            </li>
            <li>
              <strong>SSRF policy.</strong> Loopback, private, and link-local destinations are
              blocked before any request is sent.
            </li>
            <li>
              <strong>Recorded fields.</strong> Status code, latency in milliseconds, success/failure,
              and a safe error category — never response bodies.
            </li>
            <li>
              <strong>Derived state.</strong> Healthy, degraded (slow success), failing, or not
              checked yet — see the metric definitions on the About page.
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}
