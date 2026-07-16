"use client";

/**
 * Global error boundary. Vangt render-errors in de root layout op (die door
 * gewone `error.tsx`-boundaries heen glippen) en meldt ze aan Sentry. Rendert
 * een minimale fallback-pagina met eigen <html>/<body> omdat de root layout
 * hier niet meer beschikbaar is.
 */
import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="nl">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
