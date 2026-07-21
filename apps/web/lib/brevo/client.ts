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

/** Alle e-mailadressen die momenteel in een lijst zitten (gepagineerd). */
export async function listContactEmails(listId: number): Promise<string[]> {
  const emails: string[] = [];
  const limit = 500;
  for (let offset = 0; ; offset += limit) {
    const page = await brevoFetch<{ contacts?: { email?: string }[] }>(
      `/contacts/lists/${listId}/contacts`,
      { query: { limit, offset } },
    );
    const contacts = page.contacts ?? [];
    for (const c of contacts) if (c.email) emails.push(c.email);
    if (contacts.length < limit) break;
  }
  return emails;
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
