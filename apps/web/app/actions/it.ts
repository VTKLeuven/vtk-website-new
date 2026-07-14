"use server";

import * as Sentry from "@sentry/nextjs";
import { requireSession } from "@/lib/session";

/**
 * Server-side Sentry-test (admin/IT). Legt bewust een fout vast via de
 * server-SDK (sentry.server.config.ts) zodat een superadmin kan verifiëren dat
 * server-events in Sentry aankomen. We vangen de fout expliciet op i.p.v. ze te
 * gooien, zodat de UI netjes het event-ID kan tonen en er geen dubbele melding
 * via `onRequestError` ontstaat.
 *
 * Geeft het Sentry-event-ID terug, of `undefined` wanneer er geen DSN is
 * geconfigureerd (dan is de SDK inert en wordt er niets verstuurd).
 */
export async function triggerSentryServerError(): Promise<string | undefined> {
  const session = await requireSession();
  if (!session.user.isSuperAdmin) throw new Error("FORBIDDEN");

  const eventId = Sentry.captureException(
    new Error("Sentry server test error (triggered from admin/IT)"),
  );

  // In een langlopende container is dit niet strikt nodig, maar het maakt de
  // test betrouwbaar: wacht kort tot het event effectief verstuurd is.
  await Sentry.flush(2000);

  return eventId;
}
