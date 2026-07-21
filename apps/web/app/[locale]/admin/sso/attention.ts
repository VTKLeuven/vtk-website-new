import type { OauthClient } from '@prisma/client';

/**
 * Wat er mis kan zijn met een client. Bewust een korte lijst van dingen die
 * echt iets betekenen; een paneel dat bij elke client iets roept, wordt genegeerd.
 */
export type Attention = {
  clientId: string;
  clientName: string;
  code: 'insecure-redirect' | 'skip-consent' | 'no-contacts' | 'disabled' | 'locked-out';
  /** Waarom dit een probleem is, niet enkel wat er aan de hand is. */
  message: string;
};

/**
 * Hoeveel **rollen** de `<ns>.access`-permissie van een client toekennen, per
 * clientId. Zie `attentionFor` voor waarom enkel rollen tellen.
 */
export type AccessRoleGrantCounts = Record<string, number>;

/**
 * Een redirect-URI over http stuurt de autorisatiecode onversleuteld over de
 * lijn. Op localhost is dat normaal (daar is er geen netwerk), elders is het een
 * lek.
 */
function hasInsecureRedirect(uris: string[]): boolean {
  return uris.some((uri) => {
    try {
      const url = new URL(uri);
      if (url.protocol !== 'http:') return false;
      return !['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
    } catch {
      // Onparseerbaar is op zich al verdacht, maar de plugin valideert bij het
      // opslaan; hier niet nog eens alarm slaan.
      return false;
    }
  });
}

/**
 * Draait deze client volledig op VTK-domeinen? Zo ja, dan beheren we de app
 * zelf en is toestemming overslaan verdedigbaar.
 *
 * Elke redirect-URI moet erop staan, niet zomaar één: één extern adres volstaat
 * om leden naar buiten te sturen. `endsWith('.vtk.be')` met de losse gelijkheid
 * ernaast, zodat `nietvtk.be` niet meetelt.
 */
function isVtkOwned(uris: string[]): boolean {
  if (!uris.length) return false;
  return uris.every((uri) => {
    try {
      const { hostname } = new URL(uri);
      return hostname === 'vtk.be' || hostname.endsWith('.vtk.be');
    } catch {
      return false;
    }
  });
}

export function attentionFor(client: OauthClient, accessRoleGrantCount?: number): Attention[] {
  const name = client.name ?? client.clientId;
  const base = { clientId: client.clientId, clientName: name };
  const items: Attention[] = [];

  // De faalwijze van het toegangsontwerp: beperkt zetten en de access-permissie
  // nooit toekennen. Dan werkt alles behalve inloggen, en dat is precies het
  // soort stilte waar je pas achterkomt als iemand belt.
  //
  // Enkel rollen tellen mee, en dat is met opzet. Toegang hoort via een rol te
  // lopen: die wordt beheerd op het rollenscherm en volgt het werkingsjaar. Een
  // beperkte app die enkel op losse toekenningen aan personen draait, is broos
  // (valt stil zodra die ene persoon vertrekt) en verdient net wél een melding.
  if (client.accessMode === 'RESTRICTED' && accessRoleGrantCount === 0) {
    items.push({
      ...base,
      code: 'locked-out',
      message: 'Beperkt, maar geen enkele rol geeft toegang: regel dit via een rol op het rollenscherm.',
    });
  }

  if (hasInsecureRedirect(client.redirectUris)) {
    items.push({
      ...base,
      code: 'insecure-redirect',
      message: 'Stuurt autorisatiecodes over http naar een adres buiten localhost.',
    });
  }
  // Enkel melden voor apps die niet van VTK zijn: voor onze eigen apps is dit
  // een bewuste keuze en zou de melding alleen maar ruis zijn.
  if (client.skipConsent && !isVtkOwned(client.redirectUris)) {
    items.push({
      ...base,
      code: 'skip-consent',
      message:
        'Externe app zonder toestemmingsscherm: leden zien nooit welke gegevens ze afstaan. Mogelijk niet GDPR-conform.',
    });
  }
  if (!client.contacts?.length) {
    items.push({
      ...base,
      code: 'no-contacts',
      message: 'Geen contactadres: niemand om te bereiken als er iets misgaat.',
    });
  }
  if (client.disabled) {
    items.push({
      ...base,
      code: 'disabled',
      message: 'Uitgeschakeld; nieuwe aanmeldingen worden geweigerd.',
    });
  }

  return items;
}

export function attentionForAll(
  clients: OauthClient[],
  accessRoleGrantCounts: AccessRoleGrantCounts = {}
): Attention[] {
  return clients.flatMap((client) => attentionFor(client, accessRoleGrantCounts[client.clientId] ?? 0));
}
