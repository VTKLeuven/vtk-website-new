import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";

/*
 * Twee `Setting`-rijen: waar de BO-map staat (door Groep 5 ingevuld in
 * /admin/bestuursorgaan) en hoe de laatste scan verliep. Het Drive-account zelf
 * staat bij de Google-config (`driveSubject`), achter het superadminscherm: wie
 * dat kiest, kiest wiens bestanden de site mag lezen.
 */

export const BO_CONFIG_KEY = "bestuursorgaan.config";
export const BO_SCAN_KEY = "bestuursorgaan.scan";

export type BoConfig = {
  /**
   * De gedeelde drive Praesidium, of de map waarin de jaarmappen staan
   * ("2026 - 2027 Tortubois"). Daaruit zoekt de scan elk jaar zelf de map
   * Bestuursorgaan, zodat de 15-juli-wissel geen handwerk vraagt.
   */
  rootFolderId: string | null;
  /**
   * De map Bestuursorgaan per werkingsjaar, enkel wanneer de jaarmap anders
   * heet dan "2026 - 2027 ..." en de scan haar dus niet vindt.
   */
  yearFolderIds: Record<string, string>;
};

export async function getBoConfig(): Promise<BoConfig> {
  const row = await prisma.setting.findUnique({ where: { key: BO_CONFIG_KEY } });
  const value = (row?.value ?? null) as Partial<BoConfig> | null;
  return {
    rootFolderId: typeof value?.rootFolderId === "string" && value.rootFolderId ? value.rootFolderId : null,
    yearFolderIds:
      value?.yearFolderIds && typeof value.yearFolderIds === "object" ? { ...value.yearFolderIds } : {},
  };
}

export async function saveBoConfig(config: BoConfig): Promise<void> {
  const value = config as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({
    where: { key: BO_CONFIG_KEY },
    create: { key: BO_CONFIG_KEY, value },
    update: { value },
  });
}

export type BoScanYear = {
  year: number;
  /** Null wanneer de map voor dat jaar niet gevonden werd. */
  folderId: string | null;
  folderName: string | null;
  meetings: number;
  documents: number;
};

export type BoScanStatus = {
  startedAt: string;
  finishedAt: string | null;
  /** Null = gelukt. Anders de melding van Google of de reden. */
  error: string | null;
  years: BoScanYear[];
  /** Mappen in de BO-map die geen vergadering zijn ("Sjablonen"). */
  skippedFolders: string[];
  /** Snelkoppelingen waarvan het account het doel niet kan openen. */
  unreachable: string[];
  /** Hoeveel rekenbladen deze scan (opnieuw) las; ongewijzigde slaat hij over. */
  read: number;
  /** Bestanden die niet bewaard konden worden; de rest van de scan liep door. */
  failed?: string[];
};

export async function getScanStatus(): Promise<BoScanStatus | null> {
  const row = await prisma.setting.findUnique({ where: { key: BO_SCAN_KEY } });
  return (row?.value ?? null) as BoScanStatus | null;
}

export async function saveScanStatus(status: BoScanStatus): Promise<void> {
  const value = status as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({
    where: { key: BO_SCAN_KEY },
    create: { key: BO_SCAN_KEY, value },
    update: { value },
  });
}
