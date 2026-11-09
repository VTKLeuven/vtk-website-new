/**
 * Welke POC-rollen een account op Discord hoort te hebben. Puur, zodat de regels
 * zonder database en zonder Discord te testen zijn.
 *
 * Een rol volgt het account: de richtingen op de site, en enkel zolang de studie
 * dit academiejaar bevestigd is. Zie docs/design-decisions.md, "POC-peilingen".
 */

export type RolePoc = {
  discordRoleId: string | null;
  studyProgrammes: readonly string[];
};

export type RoleAccount = {
  /** Actief en niet gewist. */
  live: boolean;
  /** De studie staat bevestigd voor dit academiejaar. */
  confirmed: boolean;
  programmes: readonly string[];
};

/** De POC's met een rol waar dit account bij hoort. */
export function pocsForAccount<Poc extends RolePoc>(pocs: readonly Poc[], account: RoleAccount): Poc[] {
  if (!account.live || !account.confirmed) return [];
  return pocs.filter(
    (poc) => poc.discordRoleId && poc.studyProgrammes.some((programme) => account.programmes.includes(programme)),
  );
}

export function desiredPocRoleIds(pocs: readonly RolePoc[], account: RoleAccount): string[] {
  return [...new Set(pocsForAccount(pocs, account).flatMap((poc) => (poc.discordRoleId ? [poc.discordRoleId] : [])))];
}

export function roleChanges(
  current: readonly string[],
  desired: readonly string[],
): { add: string[]; remove: string[] } {
  return {
    add: desired.filter((roleId) => !current.includes(roleId)),
    remove: current.filter((roleId) => !desired.includes(roleId)),
  };
}

/**
 * De rollen van een lid waar de site over gaat: alles wat aan een POC hangt of
 * wat ze zelf uitdeelde. Een klik op Discord geeft alle rollen van het lid mee,
 * en die van de moderatoren of een jaarkanaal blijven van de site af.
 */
export function managedRoleIds(
  memberRoleIds: readonly string[],
  pocs: readonly RolePoc[],
  storedRoleIds: readonly string[],
): string[] {
  const managed = new Set([...pocs.flatMap((poc) => (poc.discordRoleId ? [poc.discordRoleId] : [])), ...storedRoleIds]);
  return memberRoleIds.filter((roleId) => managed.has(roleId));
}
