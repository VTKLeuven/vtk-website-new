import "server-only";

/**
 * Dunne wrapper rond de Brevo REST-API (v3). Authenticatie gaat via de
 * `api-key`-header (niet Bearer). Zonder `BREVO_KEY` staat de integratie uit en
 * gooit elke call een {@link BrevoError}; de aanroepers checken `brevoEnabled()`
 * eerst en gedragen zich dan alsof er niets te synchroniseren valt.
 */

const BREVO_BASE = "https://api.brevo.com/v3";

/** De API-key uit de omgeving; ontbreekt hij, dan staat de integratie uit. */
export function brevoApiKey(): string | null {
  return process.env.BREVO_KEY?.trim() || null;
}

export function brevoEnabled(): boolean {
  return brevoApiKey() !== null;
}

export class BrevoError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BrevoError";
  }
}

type Query = Record<string, string | number>;

async function brevoFetch<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; query?: Query } = {},
): Promise<T> {
  const key = brevoApiKey();
  if (!key) throw new BrevoError(0, "Brevo integration disabled (no BREVO_KEY)");

  const url = new URL(`${BREVO_BASE}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, String(v));

  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      "api-key": key,
      accept: "application/json",
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const detail =
      data && typeof data === "object" && "message" in data
        ? String((data as { message?: unknown }).message)
        : res.statusText;
    throw new BrevoError(res.status, `Brevo ${init.method ?? "GET"} ${path} -> ${res.status} ${detail}`);
  }
  return data as T;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// -------- Folders & lists ----------------------------------------------------

type NamedEntity = { id: number; name: string };

/** Zoek een contactfolder op naam; `null` wanneer ze nog niet bestaat. */
export async function findFolderByName(name: string): Promise<number | null> {
  const limit = 50;
  for (let offset = 0; ; offset += limit) {
    const page = await brevoFetch<{ folders?: NamedEntity[] }>("/contacts/folders", {
      query: { limit, offset },
    });
    const folders = page.folders ?? [];
    const match = folders.find((f) => f.name === name);
    if (match) return match.id;
    if (folders.length < limit) return null;
  }
}

export async function createFolder(name: string): Promise<number> {
  const res = await brevoFetch<{ id: number }>("/contacts/folders", {
    method: "POST",
    body: { name },
  });
  return res.id;
}

/** Zoek een lijst op naam binnen een folder; `null` wanneer ze nog niet bestaat. */
export async function findListByName(folderId: number, name: string): Promise<number | null> {
  const limit = 50;
  for (let offset = 0; ; offset += limit) {
    const page = await brevoFetch<{ lists?: NamedEntity[] }>(
      `/contacts/folders/${folderId}/lists`,
      { query: { limit, offset } },
    );
    const lists = page.lists ?? [];
    const match = lists.find((l) => l.name === name);
    if (match) return match.id;
    if (lists.length < limit) return null;
  }
}

export async function createList(name: string, folderId: number): Promise<number> {
  const res = await brevoFetch<{ id: number }>("/contacts/lists", {
    method: "POST",
    body: { name, folderId },
  });
  return res.id;
}

// -------- Attributes ---------------------------------------------------------

/** De namen van de bestaande "normal" contactattributen. */
export async function getContactAttributeNames(): Promise<Set<string>> {
  const res = await brevoFetch<{ attributes?: { name: string; category: string }[] }>(
    "/contacts/attributes",
  );
  return new Set(
    (res.attributes ?? []).filter((a) => a.category === "normal").map((a) => a.name),
  );
}

export async function createContactAttribute(name: string, type: "text" | "boolean"): Promise<void> {
  try {
    await brevoFetch(`/contacts/attributes/normal/${encodeURIComponent(name)}`, {
      method: "POST",
      body: { type },
    });
  } catch (err) {
    // Bestaat het attribuut al, dan geeft Brevo 400; idempotent dus negeren.
    if (err instanceof BrevoError && err.status === 400) return;
    throw err;
  }
}

// -------- Contacts -----------------------------------------------------------

/** Maak of update één contact (op e-mail), inclusief attributen en `ext_id`. */
export async function upsertContact(
  email: string,
  extId: string,
  attributes: Record<string, string | boolean>,
): Promise<void> {
  await brevoFetch("/contacts", {
    method: "POST",
    body: { email, ext_id: extId, attributes, updateEnabled: true },
  });
}

/** Voeg bestaande contacten toe aan een lijst (batches van 150). */
export async function addContactsToList(listId: number, emails: string[]): Promise<void> {
  for (const batch of chunk(emails, 150)) {
    await brevoFetch(`/contacts/lists/${listId}/contacts/add`, {
      method: "POST",
      body: { emails: batch },
    });
  }
}

/** Verwijder contacten uit een lijst (batches van 150). Onbekende adressen negeert Brevo. */
export async function removeContactsFromList(listId: number, emails: string[]): Promise<void> {
  for (const batch of chunk(emails, 150)) {
    await brevoFetch(`/contacts/lists/${listId}/contacts/remove`, {
      method: "POST",
      body: { emails: batch },
    });
  }
}

/**
 * Eén contact zoals Brevo het teruggeeft. De twee uitschrijfvelden zijn de enige
 * informatie die de site niet zelf geschreven heeft:
 *
 * - `emailBlacklisted`: het contact klikte op de uitschrijflink (of werd
 *   handmatig geblokkeerd) en krijgt **geen enkele** campagne meer;
 * - `listUnsubscribed`: de lijsten waarvoor het contact zich apart uitschreef.
 *   Dat is niet hetzelfde als "zit niet in de lijst": het contact blijft in de
 *   lijst staan, maar Brevo slaat het over.
 */
export type BrevoContact = {
  email: string;
  extId: string | null;
  emailBlacklisted: boolean;
  listUnsubscribed: number[];
};

type RawContact = {
  email?: string;
  emailBlacklisted?: boolean;
  listUnsubscribed?: number[];
  attributes?: { EXT_ID?: unknown };
};

function toContact(raw: RawContact): BrevoContact | null {
  if (!raw.email) return null;
  const extId = raw.attributes?.EXT_ID;
  return {
    email: raw.email,
    extId: typeof extId === "string" && extId ? extId : null,
    emailBlacklisted: raw.emailBlacklisted === true,
    listUnsubscribed: Array.isArray(raw.listUnsubscribed) ? raw.listUnsubscribed : [],
  };
}

/** Alle contacten die momenteel in een lijst zitten (gepagineerd), met hun uitschrijfstatus. */
export async function listContacts(listId: number): Promise<BrevoContact[]> {
  const contacts: BrevoContact[] = [];
  const limit = 500;
  for (let offset = 0; ; offset += limit) {
    const page = await brevoFetch<{ contacts?: RawContact[] }>(
      `/contacts/lists/${listId}/contacts`,
      { query: { limit, offset } },
    );
    const raw = page.contacts ?? [];
    for (const c of raw) {
      const contact = toContact(c);
      if (contact) contacts.push(contact);
    }
    if (raw.length < limit) break;
  }
  return contacts;
}

/** Eén contact op adres; `null` wanneer Brevo het niet kent (404). */
export async function getContact(email: string): Promise<BrevoContact | null> {
  try {
    const raw = await brevoFetch<RawContact>(`/contacts/${encodeURIComponent(email)}`);
    return toContact({ ...raw, email: raw.email ?? email });
  } catch (err) {
    if (err instanceof BrevoError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Draait een uitschrijving in Brevo terug, nadat het lid zich op de site opnieuw
 * inschreef. Een uitschrijving kan op twee manieren vastzitten: de blacklist op
 * het contact, en een uitschrijving per lijst (`listUnsubscribed`).
 *
 * Die tweede is niet rechtstreeks te wissen; Brevo heeft er geen veld voor. Wat
 * wél werkt, is het contact van die lijst **loskoppelen**: de uitschrijving hangt
 * aan het lidmaatschap, niet aan het contact. De gewone sync zet het daarna
 * opnieuw in de lijsten waar het volgens de site in hoort. Geef dus enkel de
 * lijsten mee waarvoor het contact écht uitgeschreven staat; de rest loskoppelen
 * is nodeloos heen en weer.
 *
 * Twee losse calls, en de blacklist eerst: die kan niet stuklopen op
 * lijstlidmaatschap en is het zwaarste deel van de uitschrijving. Faalt de unlink
 * daarna, dan is het lid alvast weer bereikbaar.
 */
export async function clearUnsubscribe(email: string, listIds: number[] = []): Promise<void> {
  await brevoFetch(`/contacts/${encodeURIComponent(email)}`, {
    method: "PUT",
    body: { emailBlacklisted: false },
  });
  if (listIds.length > 0) {
    await brevoFetch(`/contacts/${encodeURIComponent(email)}`, {
      method: "PUT",
      body: { unlinkListIds: listIds },
    });
  }
}

export type ImportContact = {
  email: string;
  ext_id: string;
  attributes: Record<string, string | boolean>;
};

/**
 * Bulk-import (bij Brevo asynchroon verwerkt): maakt/updatet contacten, zet hun
 * attributen en voegt ze aan de lijst toe. Batches van 1000 per call.
 */
export async function importContactsToList(listId: number, contacts: ImportContact[]): Promise<void> {
  for (const batch of chunk(contacts, 1000)) {
    await brevoFetch("/contacts/import", {
      method: "POST",
      body: {
        listIds: [listId],
        updateExistingContacts: true,
        emptyContactsAttributes: false,
        jsonBody: batch.map((c) => ({
          email: c.email,
          ext_id: c.ext_id,
          attributes: c.attributes,
        })),
      },
    });
  }
}
