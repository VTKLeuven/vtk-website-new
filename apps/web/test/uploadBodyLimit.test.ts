import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * De bodylimiet van server actions in de apps die foto's uploaden.
 *
 * Next weigert standaard elke server action met een body boven 1 MiB, en dat is
 * elke foto. De fak-app had die limiet niet verhoogd: het album werd aangemaakt,
 * daarna weigerde Next elke upload met "Body exceeded 1 MB limit", en de
 * gebruiker hield een leeg album over. In de serverlog stond het luid en
 * duidelijk; in de interface zag je alleen dat het misging.
 *
 * Deze test bewaakt de koppeling die toen ontbrak: de limiet in de config moet
 * minstens zo groot zijn als wat de uploadactie zelf toelaat, anders belooft de
 * app iets wat het framework ervoor al tegenhoudt.
 */

const ROOT = path.resolve(__dirname, "../../..");

function read(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

/** "110mb" of "50mb" uit de next-config, in bytes. */
function configuredLimitBytes(source: string): number | null {
  const match = source.match(/bodySizeLimit:\s*["']([\d.]+)(kb|mb|gb)["']/i);
  if (!match) return null;
  const units: Record<string, number> = { kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
  return Number(match[1]) * units[match[2].toLowerCase()];
}

/** `const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;` uit een uploadactie. */
function actionLimitBytes(source: string): number | null {
  const match = source.match(/MAX_UPLOAD_BYTES\s*=\s*([\d*\s]+);/);
  if (!match) return null;
  return match[1]
    .split("*")
    .map((part) => Number(part.trim()))
    .reduce((total, value) => total * value, 1);
}

const APPS = [
  {
    name: "fakbar",
    config: "apps/fakbar/next.config.ts",
    action: "apps/fakbar/app/actions/gallery.ts",
  },
  {
    name: "web",
    config: "apps/web/next.config.ts",
    action: null,
  },
] as const;

describe("uploads mogen groter zijn dan de standaard van 1 MiB", () => {
  it.each(APPS)("$name verhoogt de bodylimiet van server actions", ({ config }) => {
    const limit = configuredLimitBytes(read(config));
    expect(limit).not.toBeNull();
    expect(limit).toBeGreaterThan(1024 * 1024);
  });

  /**
   * De config moet ruimer zijn dan de actie, niet krapper. Anders slaat de harde
   * weigering van Next toe voor de actie haar eigen, uitlegbare "te groot"
   * kan teruggeven, en de multipart-envelop rond het bestand telt ook nog mee.
   */
  it("laat de fak-app minstens toe wat haar eigen uploadactie toestaat", () => {
    const configured = configuredLimitBytes(read("apps/fakbar/next.config.ts"));
    const action = actionLimitBytes(read("apps/fakbar/app/actions/gallery.ts"));
    expect(configured).not.toBeNull();
    expect(action).not.toBeNull();
    expect(configured!).toBeGreaterThanOrEqual(action!);
  });

  /** Wat de interface belooft, moet de server ook aannemen. */
  it("belooft de gebruiker geen grotere bestanden dan de actie aanvaardt", () => {
    const uploader = read("apps/fakbar/app/admin/fotos/album-uploader.tsx");
    const promised = uploader.match(/maximaal (\d+) MB per bestand/);
    const action = actionLimitBytes(read("apps/fakbar/app/actions/gallery.ts"));
    expect(promised).not.toBeNull();
    expect(Number(promised![1]) * 1024 * 1024).toBeLessThanOrEqual(action!);
  });
});
