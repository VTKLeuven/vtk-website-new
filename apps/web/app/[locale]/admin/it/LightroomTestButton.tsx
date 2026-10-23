"use client";

import { useState, useTransition } from "react";
import { Button } from "@vtk/ui";
import { testLightroomConnectionAction } from "@/app/actions/it";

const messages: Record<string, string> = {
  not_configured: "No API address or token configured yet.",
  unauthorized: "Kenny rejected the token (401). Check that it matches /etc/lightroom-vm/api-token.",
  unreachable: "Could not reach kenny. Is lightroom-api running and is kenny on the tailnet?",
  kenny_error: "Kenny responded with an error or something that is not a status.",
};

/** Vraagt kenny de status met de opgeslagen config. Sla eerst op, test dan. */
export function LightroomTestButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; error?: string; summary?: string } | null>(null);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setResult(null);
          start(async () => setResult(await testLightroomConnectionAction()));
        }}
      >
        {pending ? "Testing..." : "Test connection"}
      </Button>
      <p className="text-xs text-zinc-500">Tests the saved configuration, so save any changes first.</p>
      {result?.ok && <p className="text-sm text-emerald-700">Connection OK: {result.summary}.</p>}
      {result && !result.ok && (
        <p className="text-sm text-red-700">Failed: {result.error ? messages[result.error] ?? result.error : "unknown error"}</p>
      )}
    </div>
  );
}
