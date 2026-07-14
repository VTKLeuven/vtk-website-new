import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { ToastProvider } from "@/components/ui/toast";
import { hasLocale } from "@/lib/locale";
import { getCurrentSession } from "@/lib/session";

import "@/app/design/vtk-base.css";
import "@/app/design/vtk-site-header.css";
import "@/app/design/vtk-site-chrome.css";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();

  // Onboarding gate: a logged-in member whose profile is not yet completed is
  // pushed to the onboarding flow before they can use the rest of the site.
  // The resolved (locale-prefixed) path comes from the proxy via `x-pathname`;
  // we skip the redirect on the onboarding page itself to avoid a loop.
  const session = await getCurrentSession();
  if (session && !session.user.onboarded) {
    const currentPath = (await headers()).get("x-pathname") ?? "";
    const onOnboarding = currentPath.split("/")[2] === "onboarding";
    if (!onOnboarding) {
      redirect(locale === "en" ? "/en/onboarding" : "/onboarding");
    }
  }

  return (
    <ToastProvider>
      <Header locale={locale} />
      {/* `flex-1` + `min-h-0` pins main to viewport height and lets children overflow;
          that overflow painted over the footer looked like “footer in the hero”. */}
      <main className="grow" style={{ background: "var(--paper)" }}>
        {children}
      </main>
      <Footer locale={locale} />
    </ToastProvider>
  );
}
