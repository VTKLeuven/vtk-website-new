/**
 * Controleert de handtekening op een ondertekende autorisatie-query.
 *
 * De plugin tekent de query voor ze een lid naar ons toestemmings- of
 * blokscherm stuurt, en verifieert ze weer wanneer die query terugkomt. Tussen
 * die twee momenten staat de query gewoon in de adresbalk: wie erop kan
 * typen, kan er ook mee knoeien. Een pagina die iets over de client toont
 * zonder eerst te tekenen-controleren, vertelt dus wat een bezoeker zelf
 * verzonnen heeft.
 *
 * `makeSignature` en `constantTimeEqual` komen uit better-auth zelf; enkel de
 * canonicalisatie is overgenomen, want die exporteert de plugin niet. Houd ze
 * gelijk aan `canonicalizeOAuthQueryParams` in de plugin: wijkt de volgorde af,
 * dan faalt élke controle.
 */
import 'server-only';

import { constantTimeEqual, makeSignature } from 'better-auth/crypto';

/** Sorteert op sleutel, dan op waarde; identiek aan de plugin. */
function canonicalize(params: URLSearchParams): URLSearchParams {
  const canonical = new URLSearchParams();
  const entries = [...params.entries()].sort(([keyA, valueA], [keyB, valueB]) => {
    if (keyA < keyB) return -1;
    if (keyA > keyB) return 1;
    if (valueA < valueB) return -1;
    if (valueA > valueB) return 1;
    return 0;
  });
  for (const [key, value] of entries) canonical.append(key, value);
  return canonical;
}

/**
 * `true` wanneer de handtekening klopt én de query nog niet vervallen is.
 *
 * Meerdere `sig`-parameters worden geweigerd: anders kan iemand een geldige
 * handtekening naast een verzonnen zetten en hopen dat de verkeerde gelezen
 * wordt.
 */
export async function verifySignedOAuthQuery(oauthQuery: string): Promise<boolean> {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) return false;

  const params = new URLSearchParams(oauthQuery);
  const signatures = params.getAll('sig');
  if (signatures.length !== 1) return false;

  const expiresAt = Number(params.get('exp'));
  if (!Number.isFinite(expiresAt) || new Date(expiresAt * 1000) < new Date()) return false;

  params.delete('sig');
  const expected = await makeSignature(canonicalize(params).toString(), secret);
  return constantTimeEqual(signatures[0], expected);
}
