/**
 * Op welk bestaand account een KU Leuven-login landt, uitgerekend vóór
 * better-auth dat zelf doet.
 *
 * We hebben dat antwoord nodig om er de KU Leuven-attributen (de FirW-status)
 * op te schrijven. better-auth doet dat niet: bij een koppeling aan een
 * bestaand account neemt ze niets uit het profiel over, en de velden uit
 * `mapProfileToUser` landen enkel op een nieuw account.
 *
 * De volgorde volgt `handleOAuthUserInfo` in better-auth, want een afwijking
 * betekent dat de status op een ander account belandt dan waarop het lid
 * inlogt:
 *
 *   1. een KU Leuven-login die al aan een account hangt (op `accountId`);
 *   2. het account met het e-mailadres dat we better-auth laten zoeken. Dat is
 *      het KU Leuven-adres, of het adres van het account dat dit r-nummer al
 *      draagt (zie `emailForRNumber`);
 *   3. anders niets: better-auth maakt een nieuw account aan, met de velden uit
 *      `mapProfileToUser`.
 *
 * Bij stap 2 koppelt better-auth enkel wanneer dat account een bevestigd adres
 * heeft (`requireLocalEmailVerified`). Weigert ze, dan hoort de status daar ook
 * niet te landen, anders schrijven we de faculteit van een lid op een account
 * dat iemand anders op zijn adres aanmaakte.
 */

export type KulLinkLookups = {
  /** Het account waaraan deze KU Leuven-login al gekoppeld is. */
  userIdForKulAccount(accountId: string): Promise<string | null>;
  /** Het account dat dit r-nummer draagt, hoofdletters buiten beschouwing. */
  userByRNumber(rNumber: string): Promise<{ email: string } | null>;
  userByEmail(email: string): Promise<{ id: string; emailVerified: boolean } | null>;
};

export type KulLink = {
  /** Het adres waarmee better-auth het account zoekt. */
  email: string;
  /**
   * Het account waarop deze login landt, of `null` wanneer better-auth een nieuw
   * account maakt of de koppeling weigert.
   */
  userId: string | null;
};

/**
 * Het adres waarop better-auth moet zoeken wanneer het r-nummer al onder een
 * ander adres bestaat.
 *
 * better-auth koppelt enkel op e-mail. Een account kan dit r-nummer echter al
 * onder een ander adres dragen: een beheerder maakte het aan, of het lid tikte
 * zijn r-nummer in bij de onboarding van een account op zijn privé-adres. Het
 * r-nummer is door KU Leuven bevestigd en `User.rNumber` is uniek, dus een match
 * is dezelfde persoon. Zonder deze omweg neemt better-auth het aanmaakpad en
 * weigert Prisma het tweede account op de unieke `rNumber`.
 *
 * Een exacte e-mailmatch wint altijd: bestaat er al een account op het KU
 * Leuven-adres, dan blijft dat het doel.
 */
async function emailForRNumber(
  rNumber: string,
  kulEmail: string,
  lookups: KulLinkLookups,
): Promise<string> {
  const byRNumber = await lookups.userByRNumber(rNumber);
  if (!byRNumber) return kulEmail;
  const ownerEmail = byRNumber.email.toLowerCase();
  if (ownerEmail === kulEmail) return kulEmail;
  return (await lookups.userByEmail(kulEmail)) ? kulEmail : ownerEmail;
}

export async function resolveKulLink(
  identity: { accountId?: string; email: string; rNumber?: string },
  lookups: KulLinkLookups,
): Promise<KulLink> {
  const email = identity.email.toLowerCase();

  // Al gekoppeld: better-auth zoekt dan niet meer op e-mail, dus het adres doet
  // er niet toe en de r-nummeropzoeking kan weg. Dit is de login van bijna
  // iedereen, en bij een ticketverkoop tellen die twee queries.
  if (identity.accountId) {
    const linked = await lookups.userIdForKulAccount(identity.accountId);
    if (linked) return { email, userId: linked };
  }

  const lookupEmail = identity.rNumber
    ? await emailForRNumber(identity.rNumber, email, lookups)
    : email;
  const target = await lookups.userByEmail(lookupEmail);
  return { email: lookupEmail, userId: target?.emailVerified ? target.id : null };
}
