import "server-only";

import { prisma } from "@vtk/db";
import { createGalleryClient } from "@vtk/gallery";

/**
 * Vanaf de hoofdsite uploaden naar de fotogalerij van 't ElixIr.
 *
 * De fakbar heeft een eigen galerij omdat VTK op vtk.be enkel geselecteerd werk
 * wil en de fakbar na elke avond alles wil kunnen posten. Wie hier in
 * /admin/media werkt heeft soms toch die foto's in handen, en dan is
 * doorsturen naar de fakbargalerij handiger dan ze eerst over te zetten.
 *
 * **Standaard staat dat uit.** Zonder die schakelaar is de kans te groot dat
 * iemand er per ongeluk de verkeerde galerij mee kiest, en dan staat het
 * onderscheid waar dit hele verhaal om draait meteen op losse schroeven. De
 * schakelaar is een `Setting`-rij; hij geldt voor iedereen met `media.manage`,
 * niet per gebruiker, zodat het een bewuste teamafspraak is en geen
 * voorkeurtje dat één iemand aan laat staan.
 */

export const FAKBAR_UPLOAD_SETTING_KEY = "media.fakbarUpload";

/**
 * Waar de fakbar-app draait, uit de root-`.env` (`FAKBAR_APP_URL`). Zelfde
 * regel als `logisticsModuleUrl()` in `lib/admin-nav.ts` en `lib/search-server.ts`:
 * kennen we de host niet, dan geven we liever geen link dan een kapotte.
 *
 * Hier stond `https://fakbar.vtk.be` als standaard en die host bestaat niet; de
 * app draait op elixir.vtk.be, op dev op elixir.dev.vtk.be. Zonder
 * FAKBAR_APP_URL kreeg elke foto dus een downloadlink die nergens uitkwam, en
 * dat viel niet op omdat de link hier vandaag nergens getoond wordt.
 */
function fakbarAppUrl(): string | null {
  const configured = process.env.FAKBAR_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return process.env.NODE_ENV === "development" ? "http://localhost:3300" : null;
}

export const fakbarGallery = createGalleryClient({
  id: "fakbar",
  // Deze app serveert de fakbar-downloads niet; de route staat in de fakbar-app.
  // Absolute URL dus, anders wijst een gekopieerde link naar vtk.be. Een leeg
  // pad zou net dat doen, dus bij een onbekende host geven we een lege string
  // terug en geen relatieve route.
  downloadPath: (slug, assetId) => {
    const base = fakbarAppUrl();
    if (!base) return "";
    return `${base}/api/gallery/albums/${encodeURIComponent(slug)}/photos/${encodeURIComponent(assetId)}/download`;
  },
});

/** Of het uploaden naar de fakbargalerij hier aanstaat. Standaard: nee. */
export async function fakbarUploadEnabled(): Promise<boolean> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: FAKBAR_UPLOAD_SETTING_KEY } });
    const value = row?.value;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    return (value as Record<string, unknown>).enabled === true;
  } catch {
    // Kan de instelling niet gelezen worden, dan geldt de standaard: uit.
    return false;
  }
}

export async function setFakbarUploadEnabled(enabled: boolean): Promise<void> {
  const value = { enabled };
  await prisma.setting.upsert({
    where: { key: FAKBAR_UPLOAD_SETTING_KEY },
    create: { key: FAKBAR_UPLOAD_SETTING_KEY, value },
    update: { value },
  });
}
