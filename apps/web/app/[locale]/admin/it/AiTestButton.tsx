"use client";

import { useState, useTransition } from "react";
import { Button } from "@vtk/ui";
import { testAiConnectionAction } from "@/app/actions/it";
import type { AiTranslateErrorCode } from "@/lib/ai/translate";

const messages: Record<AiTranslateErrorCode, string> = {
  NOT_CONFIGURED: "No API URL configured yet.",
  UNAUTHORIZED: "The server rejected the API key (401/403).",
  TIMEOUT: "The request timed out (the model may still be loading on kenny).",
  UNREACHABLE: "Could not reach the AI server. Check the URL, network, or Tailscale.",
  BAD_RESPONSE: "The server responded, but not with valid translation JSON.",
  UPSTREAM_ERROR: "The AI server returned an error status.",
};

export function AiTestButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<
    { ok: true; model: string; sample: string } | { ok: false; error: AiTranslateErrorCode; detail?: string } | null
  >(null);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setResult(null);
          start(async () => setResult(await testAiConnectionAction()));
        }}
      >
        {pending ? "Testing..." : "Test translation"}
      </Button>
      <p className="text-xs text-zinc-500">
        Tests the saved configuration with a short NL &rarr; EN sample, so save any changes first.
      </p>
      {result?.ok && (
        <p className="text-sm text-emerald-700">
          Connection OK ({result.model}): &ldquo;{result.sample}&rdquo;
        </p>
      )}
      {result && !result.ok && (
        <p className="text-sm text-red-700">
          Failed: {messages[result.error] ?? result.detail ?? result.error}
        </p>
      )}
    </div>
  );
}
