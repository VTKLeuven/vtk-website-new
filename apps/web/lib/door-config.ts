import "server-only";
import { prisma } from "@vtk/db";
import { decryptSecret } from "./secrets";

/**
 * Runtime-configuratie van de deurscanner, beheerd via Admin -> IT en bewaard in
 * de `Setting`-tabel (net als de S3- en Sentry-config in {@link ./runtimeConfig}).
 * Het gedeelde device-secret staat versleuteld; hier ontsleutelen we het
 * server-side. Zonder DB-config vallen we terug op de omgeving (`DOOR_*`), zodat
 * een deploy blijft werken tot een superadmin het invult.
 *
 * `deviceSecret` authenticeert beide richtingen: de Pi -> `/api/door/*` en de
 * server -> de Pi z'n `/open`-listener over Tailscale.
 */

export const DOOR_SETTING_KEY = "door.config";

const DEFAULT_UNLOCK_SECONDS = 5;

/** Vorm zoals in de DB bewaard: het secret staat versleuteld in `deviceSecretEnc`. */
export type StoredDoor = {
  piUrl?: string;
  unlockSeconds?: number;
  deviceSecretEnc?: string;
};

export type DoorConfig = {
  /** Basis-URL van de Pi z'n listener over Tailscale, bv. http://door-pi:8080 (zonder trailing slash). */
  piUrl: string;
  /** Hoelang de deur ontgrendeld blijft (seconden); de server geeft dit mee aan de Pi. */
  unlockSeconds: number;
  /** Gedeeld Bearer-secret (Pi <-> server), beide richtingen. */
  deviceSecret: string;
};

function envUnlockSeconds(): number {
  const n = Number(process.env.DOOR_UNLOCK_SECONDS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_UNLOCK_SECONDS;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function envDoor(): DoorConfig {
  return {
    piUrl: stripTrailingSlash(process.env.DOOR_PI_URL || ""),
    unlockSeconds: envUnlockSeconds(),
    deviceSecret: process.env.DOOR_DEVICE_SECRET || "",
  };
}

/** Live deurconfig voor de device-API en de remote-open. DB wint; anders de omgeving. */
export async function getDoorConfig(): Promise<DoorConfig> {
  const env = envDoor();
  try {
    const row = await prisma.setting.findUnique({ where: { key: DOOR_SETTING_KEY } });
    const v = (row?.value ?? null) as unknown as StoredDoor | null;
    if (v) {
      return {
        piUrl: stripTrailingSlash(v.piUrl || env.piUrl),
        unlockSeconds: v.unlockSeconds ?? env.unlockSeconds,
        deviceSecret: v.deviceSecretEnc ? decryptSecret(v.deviceSecretEnc) : env.deviceSecret,
      };
    }
  } catch {
    /* val terug op env */
  }
  return env;
}

/**
 * Authenticeert een request van de Pi aan `/api/door/*` op het gedeelde
 * device-secret (`Authorization: Bearer <secret>`). Zonder geconfigureerd secret
 * is er geen toegang (fail closed), zodat een onvolledige config de deur-API niet
 * per ongeluk openzet.
 */
export async function isDoorDeviceRequest(request: Request): Promise<boolean> {
  const cfg = await getDoorConfig();
  if (!cfg.deviceSecret) return false;
  return request.headers.get("authorization") === `Bearer ${cfg.deviceSecret}`;
}

export type DoorStatus = {
  source: "database" | "environment";
  piUrl: string | null;
  unlockSeconds: number;
  /** Of er een device-secret bekend is; de waarde zelf geven we nooit terug. */
  hasSecret: boolean;
};

/** Niet-gevoelige status voor de IT-config-UI. Toont nooit het secret. */
export async function getDoorStatus(): Promise<DoorStatus> {
  const env = envDoor();
  const row = await prisma.setting.findUnique({ where: { key: DOOR_SETTING_KEY } });
  const v = (row?.value ?? null) as unknown as StoredDoor | null;
  if (v && (v.piUrl || v.deviceSecretEnc || v.unlockSeconds != null)) {
    return {
      source: "database",
      piUrl: v.piUrl || env.piUrl || null,
      unlockSeconds: v.unlockSeconds ?? env.unlockSeconds,
      hasSecret: Boolean(v.deviceSecretEnc) || Boolean(env.deviceSecret),
    };
  }
  return {
    source: "environment",
    piUrl: env.piUrl || null,
    unlockSeconds: env.unlockSeconds,
    hasSecret: Boolean(env.deviceSecret),
  };
}
