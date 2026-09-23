/**
 * Sentry: browser/client runtime. Next.js loads this file before hydration
 * (see node_modules/next/dist/docs/.../instrumentation-client.md). The DSN is
 * read from the (public) `NEXT_PUBLIC_SENTRY_DSN` env var; when it is unset the
 * SDK stays inert, so this is safe to ship without a DSN configured locally.
 *
 * De SDK zelf laadt pas na toestemming; zie `lib/sentryClient.ts`. Het nadeel:
 * een fout in de eerste honderden milliseconden, voor de chunk binnen is, mist
 * Sentry. Fouten op de server vangt `instrumentation.ts` hoe dan ook op.
 */
import { analyticsConsentGranted } from "@/lib/cookie-consent";
import { startSentry, startedSentry } from "@/lib/sentryClient";

if (analyticsConsentGranted()) void startSentry();

// Report App Router client-side navigations to Sentry, also once the visitor
// granted consent later on this page (the cookie banner starts Sentry then).
export function onRouterTransitionStart(
  href: string,
  navigationType: "push" | "replace" | "traverse",
) {
  void startedSentry()?.then((Sentry) => Sentry.captureRouterTransitionStart(href, navigationType));
}
