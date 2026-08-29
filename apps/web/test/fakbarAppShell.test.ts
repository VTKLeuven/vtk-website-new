import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * De omhulling van de fak-app: wat elke pagina nodig heeft om niet stuk te gaan.
 *
 * Deze tests staan in `apps/web` omdat `npm run verify` enkel de suites van
 * @vtk/web en @vtk/logistiek draait; zie `gallerySeparation.test.ts`.
 */

const ROOT = path.resolve(__dirname, "../../..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

describe("de toast-provider staat boven alles", () => {
  /**
   * `useToast()` gooit buiten een provider. De provider stond alleen in de
   * admin-layout, en toen de publieke fotopagina een formulier kreeg (een foto
   * laten verwijderen, dat via `SaveForm` een toast toont) crashte die pagina:
   * de knop deed niets. De hoofdsite zet hem om dezelfde reden in haar
   * locale-layout.
   */
  it("zit in de root-layout van de fak-app, niet enkel in de admin", () => {
    const rootLayout = read("apps/fakbar/app/layout.tsx");
    expect(rootLayout).toContain("ToastProvider");
  });

  it("staat op de hoofdsite boven de publieke pagina's", () => {
    expect(read("apps/web/app/[locale]/layout.tsx")).toContain("ToastProvider");
  });

  /**
   * Twee providers boven elkaar zouden twee toastcontainers renderen, en dan
   * verschijnt elke melding dubbel.
   */
  it("staat niet nog eens in de admin-layout van de fak-app", () => {
    expect(read("apps/fakbar/app/admin/layout.tsx")).not.toContain("<ToastProvider>");
  });
});

describe("de fak-app vangt fouten in haar eigen vormtaal op", () => {
  /**
   * Zonder deze bestanden valt Next terug op zijn kale standaardpagina: geen
   * header, geen voettekst, geen kleuren. Dat leest niet als "er ging iets mis"
   * maar als "de site is kapot", en het was precies wat een bezoeker te zien
   * kreeg toen de fotopagina op de ontbrekende toast-provider stukliep.
   */
  it.each(["apps/fakbar/app/error.tsx", "apps/fakbar/app/not-found.tsx"])("heeft %s", (file) => {
    expect(existsSync(path.join(ROOT, file))).toBe(true);
  });
});
