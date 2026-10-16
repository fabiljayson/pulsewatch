import { useEffect, useState } from "react";

import { ApiError } from "../../api/client";
import type { PulseWatchApi } from "../../api/pulsewatch";
import type { Endpoint } from "../../api/types";
import { useAction } from "../../hooks";
import { ConfirmDialog, TextField } from "../../components/ui";

export interface EditEndpointDialogProps {
  open: boolean;
  endpoint: Endpoint;
  api: PulseWatchApi;
  onClose: () => void;
  onSaved: () => void;
}

/** Rename dialog; the backend only supports name + active-flag updates. */
export function EditEndpointDialog({ open, endpoint, api, onClose, onSaved }: EditEndpointDialogProps) {
  const [name, setName] = useState(endpoint.name);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(endpoint.name);
      setError(null);
    }
  }, [open, endpoint.name]);

  const save = useAction(async (nextName: string) => api.updateEndpoint(endpoint.id, { name: nextName }));

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name must not be blank.");
      return;
    }
    if (trimmed.length > 100) {
      setError("Name must be 100 characters or fewer.");
      return;
    }
    try {
      const saved = await save.run(trimmed);
      if (!saved) return;
      onSaved();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save the new name.");
    }
  };

  return (
    <ConfirmDialog
      open={open}
      title="Edit endpoint"
      description={
        <div className="stack stack--sm">
          <p className="muted text-sm">
            The URL is fixed after registration — only the display name can be changed.
          </p>
          <TextField
            id="edit-endpoint-name"
            label="Display name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError(null);
            }}
            maxLength={100}
            autoComplete="off"
            error={error}
          />
        </div>
      }
      confirmLabel="Save changes"
      busy={save.busy}
      onConfirm={() => void handleSave()}
      onCancel={onClose}
    />
  );
}
