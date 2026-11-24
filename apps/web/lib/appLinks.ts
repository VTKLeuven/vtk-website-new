import { prisma } from "@vtk/db";

/**
 * De links naar de VTK-app in de App Store en in Google Play.
 *
 * Ze staan in een `Setting` en worden ingesteld onder Admin › Website › App, zodat
 * een nieuwe link geen deploy vraagt. `vtk.be/app` leest ze en stuurt een
 * telefoon meteen naar de juiste winkel; de QR-code op de affiches wijst naar dat
 * adres en hoeft dus nooit te veranderen.
 */
export const APP_LINKS_SETTING = "app.links";

export type AppLinks = {
  /** De pagina van de app in de App Store, of `null` zolang ze er niet staat. */
  ios: string | null;
  /** De pagina van de app in Google Play, of `null` zolang ze er niet staat. */
  android: string | null;
};

export async function getAppLinks(): Promise<AppLinks> {
  const row = await prisma.setting.findUnique({ where: { key: APP_LINKS_SETTING } });
  const value = (row?.value ?? {}) as Partial<Record<keyof AppLinks, unknown>>;
  return { ios: cleanLink(value.ios), android: cleanLink(value.android) };
}

/** Enkel een volledige https-link telt; al de rest is "nog niet ingesteld". */
export function cleanLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^https:\/\/\S+$/i.test(trimmed) ? trimmed : null;
}

/**
 * Welk toestel een user-agent is. Een iPad die zich als Mac voordoet (iPadOS
 * vraagt standaard de desktopsite) valt hier onder "andere" en krijgt de pagina
 * met beide knoppen; dat is beter dan hem naar de verkeerde winkel te sturen.
 */
export function platformFromUserAgent(userAgent: string): "ios" | "android" | null {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  return null;
}
