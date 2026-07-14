"use client";

import { useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@vtk/ui";
import { triggerSentryServerError } from "@/app/actions/it";

type Status =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

export function SentryTest({ dsnConfigured }: { dsnConfigured: boolean }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const captureClient = () => {
    const eventId = Sentry.captureException(
      new Error("Sentry client test error (triggered from admin/IT)"),
    );
    setStatus({ kind: "ok", message: `Client event captured (id: ${eventId ?? "unknown"}).` });
  };

  const throwClient = () => {
    // Deliberately uncaught: picked up by Sentry's global error handler.
    throw new Error("Sentry uncaught client error (triggered from admin/IT)");
  };

  const captureServer = async () => {
    setStatus({ kind: "pending" });
    try {
      const eventId = await triggerSentryServerError();
      setStatus({ kind: "ok", message: `Server event captured (id: ${eventId ?? "unknown"}).` });
    } catch (err) {
      setStatus({
        kind: "error",
        message: "Server test failed: " + (err instanceof Error ? err.message : String(err)),
      });
    }
  };

  return (
    <div className="space-y-4">
      {!dsnConfigured && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No Sentry DSN configured, so the SDK is inert and sends nothing. Set
          NEXT_PUBLIC_SENTRY_DSN / SENTRY_DSN in the root .env to test for real.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={captureClient}>
          Send client event
        </Button>
        <Button variant="ghost" onClick={captureServer} disabled={status.kind === "pending"}>
          Send server event
        </Button>
        <Button variant="danger" onClick={throwClient}>
          Throw uncaught error
        </Button>
      </div>

      {status.kind === "ok" && <p className="text-sm text-emerald-700">{status.message}</p>}
      {status.kind === "error" && <p className="text-sm text-red-700">{status.message}</p>}
    </div>
  );
}
