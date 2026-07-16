"use client";

import { useState, useTransition } from "react";
import { Button } from "@vtk/ui";
import { testS3ConnectionAction } from "@/app/actions/it";

/**
 * Test de opgeslagen S3-config (HeadBucket) zodat een superadmin meteen ziet of
 * endpoint/credentials/bucket kloppen. Sla eerst op, test dan.
 */
export function S3TestButton() {
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
          start(async () => setResult(await testS3ConnectionAction()));
        }}
      >
        {pending ? "Testing..." : "Test connection"}
      </Button>
      <p className="text-xs text-zinc-500">Tests the saved configuration, so save any changes first.</p>
      {result?.ok && (
        <p className="text-sm text-emerald-700">Connection OK: the bucket is reachable.</p>
      )}
      {result && !result.ok && (
        <p className="text-sm text-red-700">Failed: {result.error}</p>
      )}
    </div>
  );
}
