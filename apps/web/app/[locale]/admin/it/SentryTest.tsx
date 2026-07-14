"use client";

import { useEffect, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@vtk/ui";
import { triggerSentryServerError } from "@/app/actions/it";

type Status =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

export function SentryTest({ nl }: { nl: boolean }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Zonder DSN is de SDK inert: events worden nergens heen verstuurd. Detecteer
  // dat zodat de test geen valse "verstuurd"-melding geeft.
  const [dsnConfigured, setDsnConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    setDsnConfigured(Boolean(Sentry.getClient()?.getDsn()));
  }, []);

  const captureClient = () => {
    const eventId = Sentry.captureException(
      new Error("Sentry client-test-fout (bewust getriggerd via admin/IT)"),
    );
    setStatus({
      kind: "ok",
      message: nl
        ? `Client-event vastgelegd (id: ${eventId ?? "onbekend"}).`
        : `Client event captured (id: ${eventId ?? "unknown"}).`,
    });
  };

  const throwClient = () => {
    // Bewust onafgevangen: wordt door Sentry's global error handler opgepikt.
    throw new Error("Sentry onafgevangen client-fout (bewust getriggerd via admin/IT)");
  };

  const captureServer = async () => {
    setStatus({ kind: "pending" });
    try {
      const eventId = await triggerSentryServerError();
      setStatus({
        kind: "ok",
        message: nl
          ? `Server-event vastgelegd (id: ${eventId ?? "onbekend"}).`
          : `Server event captured (id: ${eventId ?? "unknown"}).`,
      });
    } catch (err) {
      setStatus({
        kind: "error",
        message:
          (nl ? "Server-test mislukt: " : "Server test failed: ") +
          (err instanceof Error ? err.message : String(err)),
      });
    }
  };

  return (
    <div className="space-y-4">
      {dsnConfigured === false && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {nl
            ? "Geen Sentry-DSN geconfigureerd — de SDK is inert en verstuurt niets. Zet NEXT_PUBLIC_SENTRY_DSN / SENTRY_DSN in de root-.env om echt te testen."
            : "No Sentry DSN configured — the SDK is inert and sends nothing. Set NEXT_PUBLIC_SENTRY_DSN / SENTRY_DSN in the root .env to test for real."}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={captureClient}>
          {nl ? "Client-event versturen" : "Send client event"}
        </Button>
        <Button variant="ghost" onClick={captureServer} disabled={status.kind === "pending"}>
          {nl ? "Server-event versturen" : "Send server event"}
        </Button>
        <Button variant="danger" onClick={throwClient}>
          {nl ? "Onafgevangen fout gooien" : "Throw uncaught error"}
        </Button>
      </div>

      {status.kind === "ok" && (
        <p className="text-sm text-emerald-700">{status.message}</p>
      )}
      {status.kind === "error" && (
        <p className="text-sm text-red-700">{status.message}</p>
      )}
    </div>
  );
}
