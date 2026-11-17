/**
 * Welke POC-rollen een account op Discord hoort te hebben. Puur, zodat de regels
 * zonder database en zonder Discord te testen zijn.
 *
 * Een rol volgt het account: de richtingen en de fases op de site, en enkel
 * zolang de studie dit academiejaar bevestigd is. Zie docs/design-decisions.md,
 * "POC-peilingen".
 */

/** Eén rol van een POC. Zonder fases krijgt iedereen van de POC ze. */
export type RolePocRole = {
  roleId: string;
  studyYears: readonly string[];
};

export type RolePoc = {
  studyProgrammes: readonly string[];
  discordRoles: readonly RolePocRole[];
};

export type RoleAccount = {
  /** Actief en niet gewist. */
  live: boolean;
  /** De studie staat bevestigd voor dit academiejaar. */
  confirmed: boolean;
  programmes: readonly string[];
  years: readonly string[];
};

function roleFits(role: RolePocRole, account: RoleAccount): boolean {
  return role.studyYears.length === 0 || role.studyYears.some((year) => account.years.includes(year));
}

/** De rollen van deze POC die bij dit account passen. */
function rolesFor(poc: RolePoc, account: RoleAccount): string[] {
  if (!poc.studyProgrammes.some((programme) => account.programmes.includes(programme))) return [];
  return poc.discordRoles.filter((role) => roleFits(role, account)).map((role) => role.roleId);
}

/** De POC's waarvan dit account minstens één rol krijgt. */
export function pocsForAccount<Poc extends RolePoc>(pocs: readonly Poc[], account: RoleAccount): Poc[] {
  if (!account.live || !account.confirmed) return [];
  return pocs.filter((poc) => rolesFor(poc, account).length > 0);
}

export function desiredPocRoleIds(pocs: readonly RolePoc[], account: RoleAccount): string[] {
  if (!account.live || !account.confirmed) return [];
  return [...new Set(pocs.flatMap((poc) => rolesFor(poc, account)))];
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
 * De rollen van een lid waar de site over gaat: enkel wat ze zelf uitdeelde en
 * het lid nog heeft. Studenten kiezen een jaarrol ook zelf op Discord, en een
 * rol die toevallig ook aan een POC hangt, is daarom nog niet van de site. Een
 * klik op Discord geeft alle rollen van het lid mee; die van de moderatoren, een
 * jaarkanaal of een eigen keuze blijven van de site af.
 */
export function managedRoleIds(memberRoleIds: readonly string[], storedRoleIds: readonly string[]): string[] {
  return memberRoleIds.filter((roleId) => storedRoleIds.includes(roleId));
}
