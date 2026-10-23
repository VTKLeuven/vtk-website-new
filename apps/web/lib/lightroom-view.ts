/**
 * De Lightroom-pc zoals de site hem toont. Kenny's `lightroom-api` antwoordt met
 * de uitvoer van `lightroom-vm status --json` (zie infra/lightroom); hier wordt
 * dat herleid tot één toestand voor het scherm.
 *
 * Puur en zonder `server-only`: de pagina, de voorvertoning op /admin/it/flows
 * en de tests gebruiken dezelfde regels.
 */

/** De naam waaronder de VM in Parsec staat (Computers -> Connect). */
export const LIGHTROOM_COMPUTER_NAME = "VTK-LIGHTROOM";

/**
 * Waarom kenny een start weigert. Kenny stuurt een code en een Engelse zin voor
 * wie lightroom-vm draait; de site zegt de code in eigen woorden en toont die zin
 * enkel als detail. Een code die de site nog niet kent, wordt `check_failed`.
 */
export const LIGHTROOM_BLOCKERS = [
  "job",
  "gpu_in_use",
  "comfy_busy",
  "memory",
  "gpu_detached",
  "maintenance",
  "check_failed",
] as const;
export type LightroomBlocker = (typeof LIGHTROOM_BLOCKERS)[number];

export type LightroomStatus = {
  /** off | starting | running | stopping | error | console */
  state: string;
  /** Windows antwoordt: opgestart of hervat, Parsec kan verbinden. */
  ready: boolean;
  /** Sinds wanneer in deze toestand, in unix-seconden. */
  since: number | null;
  startedBy: string | null;
  message: string | null;
  idleLimitMinutes: number;
  hibernateInMinutes: number | null;
  parsecUsers: string[];
  canStart: boolean;
  blockers: LightroomBlocker[];
  /** Kenny's eigen zinnen bij de blockers, voor IT. */
  blockerDetails: string[];
};

const DEFAULT_IDLE_MINUTES = 30;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];
}

/**
 * Leest het antwoord van kenny defensief: een veld dat ontbreekt of een vreemd
 * type heeft, valt terug op "weet niet" in plaats van de pagina te breken. Geen
 * object of geen `state`: `null`.
 */
export function parseLightroomStatus(raw: unknown): LightroomStatus | null {
  if (!isRecord(raw)) return null;
  const state = str(raw.state);
  if (!state) return null;
  const known = new Set<string>(LIGHTROOM_BLOCKERS);
  const blockers = [
    ...new Set(strings(raw.blocker_codes).map((code) => (known.has(code) ? code : "check_failed"))),
  ] as LightroomBlocker[];
  return {
    state,
    ready: raw.ready === true,
    since: num(raw.since),
    startedBy: str(raw.started_by),
    message: str(raw.message),
    idleLimitMinutes: num(raw.idle_limit_minutes) ?? DEFAULT_IDLE_MINUTES,
    hibernateInMinutes: num(raw.hibernate_in_minutes),
    parsecUsers: strings(raw.parsec_users),
    canStart: raw.can_start === true,
    blockers,
    blockerDetails: strings(raw.blockers),
  };
}

export type LightroomView =
  | {
      kind: "off";
      canStart: boolean;
      blockers: LightroomBlocker[];
      details: string[];
      message: string | null;
      since: number | null;
    }
  /** GPU 0 gaat over naar de VM, of Windows start nog op of hervat nog. */
  | { kind: "starting"; since: number | null; startedBy: string | null }
  | {
      kind: "ready";
      startedBy: string | null;
      users: string[];
      hibernateInMinutes: number | null;
      idleLimitMinutes: number;
    }
  | { kind: "stopping" }
  /** IT heeft de VM zonder GPU aan staan (onderhoud) of buiten lightroom-vm om gestart. */
  | { kind: "maintenance" }
  /** De VM wou niet in slaapstand; GPU 0 zit nog vast. IT moet kijken. */
  | { kind: "error"; message: string | null };

export function lightroomView(status: LightroomStatus): LightroomView {
  switch (status.state) {
    case "starting":
      return { kind: "starting", since: status.since, startedBy: status.startedBy };
    case "running":
      // Kenny meldt `running` zodra de VM aan staat; Windows heeft dan nog een
      // paar minuten nodig. Pas als het antwoordt, heeft verbinden zin.
      if (!status.ready) return { kind: "starting", since: status.since, startedBy: status.startedBy };
      return {
        kind: "ready",
        startedBy: status.startedBy,
        users: status.parsecUsers,
        hibernateInMinutes: status.hibernateInMinutes,
        idleLimitMinutes: status.idleLimitMinutes,
      };
    case "stopping":
      return { kind: "stopping" };
    case "console":
      return { kind: "maintenance" };
    case "error":
      return { kind: "error", message: status.message };
    default:
      // Een start van IT met de hand of tijdens de installatie geeft `off` met
      // de blocker `maintenance`; die toont de site als onderhoud.
      if (status.blockers.includes("maintenance")) return { kind: "maintenance" };
      return {
        kind: "off",
        canStart: status.canStart,
        blockers: status.blockers,
        details: status.blockerDetails,
        message: status.message,
        since: status.since,
      };
  }
}

/**
 * Hoe vaak de pagina opnieuw vraagt: snel terwijl er iets verandert, traag als
 * hij stilstaat. Elke vraag laat kenny de GPU's en containers nakijken, dus niet
 * elke seconde.
 */
export function lightroomPollMs(view: LightroomView): number {
  return view.kind === "starting" || view.kind === "stopping" ? 5_000 : 30_000;
}
