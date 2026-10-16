import { useEffect } from "react";
import { Link } from "react-router-dom";

import { EmptyState } from "../components/ui";

export function NotFoundPage() {
  useEffect(() => {
    document.title = "Not found · PulseWatch";
  }, []);

  return (
    <div className="fullscreen-state">
      <EmptyState glyph="⚠" title="Page not found">
        <p>The address you opened does not match any PulseWatch page.</p>
      </EmptyState>
      <Link className="btn btn--primary" to="/dashboard">
        Go to the overview
      </Link>
    </div>
  );
}
