/**
 * Zet een lid plus de toegestane scopes om in de claims die een client krijgt.
 *
 * Eén claim die stukloopt mag nooit het uitgeven van tokens breken; daarom
 * wordt elke claim apart afgehandeld en bij een fout gewoon weggelaten (12.10).
 */
import 'server-only';

import { prisma } from '@vtk/db';
import { CLAIMS, type ClaimDefinition, type ClaimDestination } from '../lib/claims';
import { transform } from '../lib/transformers';

type UserRow = NonNullable<Awaited<ReturnType<typeof loadUser>>>;

/**
 * Enkel de `User`-rij: geen rollen, posten of permissies.
 *
 * Die join zat hier tot we besloten dat een client niets over VTK's interne
 * structuur hoort te weten (geen `vtk:roles`, `vtk:permissions`, `vtk:groups`).
 * Fase 5 heeft ze opnieuw nodig, maar dan om de permissies van *die client* op
 * te lossen; `userGrantsInclude` in session.ts staat er dan al voor klaar.
 */
async function loadUser(userId: string) {
  return prisma.user.findUnique({ where: { id: userId } });
}

/**
 * Claims die logica nodig hebben. Bewust code en geen expressietaal in een
 * tabel: dat laatste is een sandbox-ontsnapping in wording, en niet te reviewen.
 */
const COMPUTED: Record<string, (user: UserRow) => unknown> = {
  /** Het adres waarop de kring dit lid effectief contacteert. */
  preferredEmail: (user) =>
    user.emailPreference === 'PERSONAL' && user.personalEmail ? user.personalEmail : user.email,

  /** Een geüpload avatar wint van de afbeelding die de SSO-provider meegaf. */
  picture: (user) => user.avatarKey ?? user.image ?? null,

  /** Het adresformaat uit OpenID Connect Core 5.1.1. */
  oidcAddress: (user) => {
    const street = [user.street, user.houseNumber, user.bus ? `bus ${user.bus}` : null].filter(Boolean).join(' ');
    const parts = [street, [user.postalCode, user.city].filter(Boolean).join(' ')].filter(Boolean);
    if (!parts.length) return null;
    return {
      formatted: parts.join('\n'),
      street_address: street || undefined,
      postal_code: user.postalCode ?? undefined,
      locality: user.city ?? undefined,
      country: 'BE',
    };
  },
};

function readSource(claim: ClaimDefinition, user: UserRow): unknown {
  switch (claim.source.kind) {
    case 'USER_FIELD':
      return (user as unknown as Record<string, unknown>)[claim.source.field];
    case 'COMPUTED':
      return COMPUTED[claim.source.resolver]?.(user) ?? null;
  }
}

export type ResolveClaimsInput = {
  destination: ClaimDestination;
  userId: string;
  scopes: string[];
};

/**
 * De claims voor één bestemming. Een lege scope-lijst levert niets op: zonder
 * toestemming komt er niets vrij.
 */
export async function resolveClaims(input: ResolveClaimsInput): Promise<Record<string, unknown>> {
  if (!input.scopes.length) return {};

  const user = await loadUser(input.userId);
  if (!user || !user.active) return {};

  const granted = new Set(input.scopes);
  const out: Record<string, unknown> = {};

  for (const claim of CLAIMS) {
    if (!granted.has(claim.scope)) continue;
    if (!claim.destinations.includes(input.destination)) continue;

    try {
      const value = transform(readSource(claim, user), claim.transformer, claim.transformerArgs);
      // `null` betekent "niets in te vullen"; die claim hoort dan niet in het
      // token te staan in plaats van als lege waarde.
      if (value !== null && value !== undefined) out[claim.name] = value;
    } catch (error) {
      // Eén stukke claim mag de rest niet meenemen.
      console.error(`[sso] claim ${claim.name} kon niet opgelost worden:`, error);
    }
  }

  return out;
}
