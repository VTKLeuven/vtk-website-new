/**
 * De organisatie-eenheden die de site kent: waar nu een account in staat, plus
 * de OU's uit de instellingen. De site mag de lijst van OU's zelf niet lezen
 * (daarvoor is een extra scope nodig die niet in de delegatie staat), dus een
 * nieuwe, nog lege OU vul je één keer in de Admin console.
 *
 * Geen `server-only`: puur.
 */
export function knownOrgUnits(
  directory: { orgUnitPath?: string }[],
  cfg: { fullOrgUnit: string; restrictedOrgUnit: string | null; aliasSenderOrgUnit: string | null },
): string[] {
  const set = new Set<string>(["/"]);
  for (const user of directory) if (user.orgUnitPath) set.add(user.orgUnitPath);
  for (const ou of [cfg.fullOrgUnit, cfg.restrictedOrgUnit, cfg.aliasSenderOrgUnit]) if (ou) set.add(ou);
  return [...set].sort((a, b) => a.localeCompare(b));
}
