"use client";

import { useState, useTransition } from "react";
import { Button } from "@vtk/ui";
import { testDoorConnectionAction } from "@/app/actions/it";

const messages: Record<string, string> = {
  no_url: "No Pi address configured yet.",
  no_secret: "No device secret configured yet.",
  unauthorized: "The Pi rejected the secret (401). Check that both sides use the same value.",
  unreachable: "Could not reach the Pi. Is it on and on the tailnet?",
  pi_error: "The Pi responded with an error.",
};

/**
 * Test de verbinding met de Pi-listener (GET /health met het device-secret) zodat
 * een superadmin ziet of adres + secret kloppen. Sla eerst op, test dan.
 */
export function DoorTestButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setResult(null);
          start(async () => setResult(await testDoorConnectionAction()));
        }}
      >
        {pending ? "Testing..." : "Test connection"}
      </Button>
      <p className="text-xs text-zinc-500">Tests the saved configuration, so save any changes first.</p>
      {result?.ok && <p className="text-sm text-emerald-700">Connection OK: the Pi is reachable and accepted the secret.</p>}
      {result && !result.ok && (
        <p className="text-sm text-red-700">Failed: {result.error ? messages[result.error] ?? result.error : "unknown error"}</p>
      )}
    </div>
  );
}
