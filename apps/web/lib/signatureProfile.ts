/**
 * De handtekening van een lid: wat het zelf invulde, aangevuld met wat afgeleid
 * kan worden.
 *
 * De generator zelf staat in `lib/signature.ts` en verandert hier niet; dit
 * bepaalt enkel wat erin gaat. Dat was tot nu toe een zaak van het
 * handtekeningscherm alleen: de velden stonden in `localStorage`, dus ze waren
 * weg op een andere browser en de server kon ze niet lezen.
 *
 * Dat laatste werd een probleem toen de mails van de lesbezoeken en de
 * Theokot-verhuur ondertekend moesten worden door wie ze verstuurt. Die
 * ondertekening hoort dezelfde te zijn als de handtekening van dat lid, en dan
 * is er maar een bron nodig: het profiel.
 *
 * De functiepresets stonden eerst in `AccountSignature` zelf. Ze staan hier
 * omdat het scherm en de mail hetzelfde moeten voorstellen; twee kopieen lopen
 * uiteen zodra iemand er een aanpast.
 *
 * Puur, dus testbaar zonder database: `test/signatureProfile.test.ts`.
 */

import { buildDefaultVtkEmail, type SignatureData } from "@/lib/signature";

/** Een postlidmaatschap zoals het scherm en de resolver het nodig hebben. */
export type SignatureMembership = {
  groupNameNl: string;
  groupNameEn: string;
  titleNl: string | null;
  titleEn: string | null;
  yearCode: string;
};

/** Wat het lid zelf invulde. Alles leeg = alles afgeleid. */
export type StoredSignature = {
  signatureName: string | null;
  signatureRoleTitle: string | null;
  signatureEmail: string | null;
  signaturePhone: string | null;
};

/** Het lid zoals het uit de database komt. */
export type SignatureUser = {
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
};

export type SignaturePreset = { label: string; value: string };

/**
 * De ondertekening in haar twee vormen.
 *
 * `text` staat in het bewerkveld en in de platte mail; `html` is dezelfde
 * handtekening met het schild en de gele streep, zoals /account ze kopieert. De
 * beheerschermen dragen ze allebei mee: composeren gebeurt met de tekst, het
 * voorbeeld en de verstuurde mail tonen de opmaak.
 *
 * Staat hier en niet in de server-only module, zodat een client component het
 * type mag kennen.
 */
export type MailSignature = { text: string; html: string };

/**
 * De functies die dit lid kan kiezen, uit zijn postlidmaatschappen.
 *
 * Een lidmaatschap levert er twee: de eigen titel ("VTK Onderwijs 26-27") en de
 * naam van de post. Een titel die zelf al met "VTK" begint, blijft zoals ze is;
 * anders wordt ze ervoor gezet, want de handtekening draagt de kring en niet
 * enkel de functie.
 */
export function signatureRolePresets(
  memberships: readonly SignatureMembership[],
  locale: "nl" | "en",
  currentYearCode: string,
): SignaturePreset[] {
  const presets: SignaturePreset[] = [];
  const seen = new Set<string>();

  const push = (value: string, yearCode: string) => {
    if (!value.trim() || seen.has(value)) return;
    seen.add(value);
    presets.push({ label: `${value} (${yearCode})`, value });
  };

  for (const m of memberships) {
    const groupName = locale === "en" ? m.groupNameEn : m.groupNameNl;
    const title = locale === "en" ? m.titleEn : m.titleNl;

    if (title && title.trim()) {
      push(title.startsWith("VTK") ? title : `VTK ${title} ${m.yearCode}`, m.yearCode);
    }
    if (groupName && groupName.trim()) {
      push(`VTK ${groupName} ${m.yearCode}`, m.yearCode);
    }
  }

  // Zonder lidmaatschap blijft er nog altijd een functie over: de kring zelf.
  if (presets.length === 0) {
    const fallback = `VTK ${currentYearCode}`;
    presets.push({ label: fallback, value: fallback });
  }

  return presets;
}

/**
 * De handtekening van dit lid: het ingevulde veld, of anders het afgeleide.
 *
 * Bewust per veld en niet alles-of-niets: wie enkel zijn nummer invulde, houdt
 * een kloppende naam en functie.
 */
export function resolveSignatureData(
  user: SignatureUser,
  stored: StoredSignature,
  memberships: readonly SignatureMembership[],
  locale: "nl" | "en",
  currentYearCode: string,
): SignatureData {
  const derivedName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name;
  const presets = signatureRolePresets(memberships, locale, currentYearCode);

  return {
    fullName: pick(stored.signatureName, derivedName),
    roleTitle: pick(stored.signatureRoleTitle, presets[0]?.value ?? `VTK ${currentYearCode}`),
    emailAddress: pick(
      stored.signatureEmail,
      buildDefaultVtkEmail(user.firstName, user.lastName, user.email),
    ),
    // Het nummer staat nergens anders: niet ingevuld is geen nummer, en dan valt
    // die regel weg in plaats van als een kale "M:" te blijven staan.
    phoneDisplay: (stored.signaturePhone ?? "").trim(),
  };
}

function pick(stored: string | null, derived: string): string {
  const value = (stored ?? "").trim();
  return value || derived;
}
