import { Button, Card } from "@vtk/ui";
import { startAuthorizationPreview } from "@/app/actions/authorization-preview";

type RoleOption = {
  id: string;
  nameNl: string;
  nameEn: string;
  code: string;
  permissions: Array<{ permission: { code: string } }>;
};

type GroupOption = {
  id: string;
  nameNl: string;
  nameEn: string;
  type: "PRAESIDIUM" | "WERKGROEP";
  roleGrants: Array<{ kind: "DEFAULT" | "LEADER"; role: { nameNl: string; nameEn: string } }>;
};

export function AuthorizationPreviewPanel({
  locale,
  roles,
  groups,
}: {
  locale: "nl" | "en";
  roles: RoleOption[];
  groups: GroupOption[];
}) {
  const nl = locale === "nl";

  return (
    <section className="space-y-3">
      <div>
        {/* Deze panel vult een eigen pagina (/admin/it/preview), dus dit is de
            paginakop en geen sectiekop. */}
        <h1 className="text-2xl font-semibold">
          {nl ? "Autorisatievoorbeeld" : "Authorization preview"}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {nl
            ? "Bekijk de frontend en admin alsof je deze rollen en posten hebt. Je echte identiteit blijft behouden; er wordt nooit een ander account geopend. De voorbeeldmodus is volledig alleen-lezen en stopt automatisch na twee uur."
            : "View the frontend and admin as if you had these roles and posts. Your real identity is preserved; another account is never opened. Preview mode is fully read-only and expires after two hours."}
        </p>
      </div>

      <Card className="p-5">
        <form action={startAuthorizationPreview} className="space-y-5">
          <input type="hidden" name="locale" value={locale} />

          <fieldset>
            <legend className="text-sm font-semibold text-vtk-ink">
              {nl ? "Rechtstreeks toegewezen rollen" : "Directly assigned roles"}
            </legend>
            <p className="mb-3 mt-1 text-xs text-zinc-500">
              {nl
                ? "Postrollen worden hieronder automatisch afgeleid en hoef je hier niet opnieuw aan te vinken."
                : "Roles granted by posts are derived below and do not need to be selected again here."}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {roles.map((role) => (
                <label
                  key={role.id}
                  className="flex items-start gap-3 rounded-xl border border-vtk-blue/10 bg-vtk-blue-soft/25 p-3 text-sm"
                >
                  <input className="mt-1 shrink-0" type="checkbox" name="roleId" value={role.id} />
                  <span className="min-w-0">
                    <span className="block font-medium text-vtk-ink">
                      {nl ? role.nameNl : role.nameEn}
                    </span>
                    <span className="block break-all text-xs text-zinc-500">
                      {role.permissions.length > 0
                        ? role.permissions.map((entry) => entry.permission.code).join(", ")
                        : nl
                          ? "Geen websitepermissies"
                          : "No website permissions"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-vtk-ink">
              {nl ? "Posten en werkgroepen" : "Posts and working groups"}
            </legend>
            <p className="mb-3 mt-1 text-xs text-zinc-500">
              {nl
                ? "Kies Lid of Verantwoordelijke; LEADER-rollen gelden alleen voor de verantwoordelijke."
                : "Choose Member or Lead; LEADER roles apply only to the lead."}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-start gap-3 rounded-xl border border-vtk-blue/10 bg-vtk-blue-soft/25 p-3"
                >
                  <input className="mt-1 shrink-0" type="checkbox" name="groupId" value={group.id} />
                  <div className="min-w-0 flex-1">
                    <label className="block text-sm font-medium text-vtk-ink">
                      {nl ? group.nameNl : group.nameEn}
                      <span className="ml-2 text-[0.68rem] font-normal uppercase tracking-wide text-zinc-500">
                        {group.type === "WERKGROEP" ? (nl ? "werkgroep" : "working group") : "post"}
                      </span>
                    </label>
                    <select
                      name={`groupRole:${group.id}`}
                      defaultValue="MEMBER"
                      aria-label={`${nl ? group.nameNl : group.nameEn}: ${nl ? "lidmaatschap" : "membership"}`}
                      className="mt-2 w-full rounded-lg border border-vtk-blue/15 bg-white px-2 py-1.5 text-xs text-vtk-ink"
                    >
                      <option value="MEMBER">{nl ? "Lid" : "Member"}</option>
                      <option value="LEAD">{nl ? "Verantwoordelijke" : "Lead"}</option>
                    </select>
                    <span className="mt-1 block text-xs text-zinc-500">
                      {group.roleGrants.length > 0
                        ? group.roleGrants
                            .map(
                              (grant) =>
                                `${nl ? grant.role.nameNl : grant.role.nameEn}${grant.kind === "LEADER" ? " (lead)" : ""}`,
                            )
                            .join(", ")
                        : nl
                          ? "Deze post kent geen rollen toe"
                          : "This post grants no roles"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-vtk-blue/10 pt-4">
            <p className="max-w-xl text-xs text-zinc-500">
              {nl
                ? "Accountgebonden gegevens zoals eigen tickets en persoonlijke voorkeuren blijven van je echte account; alleen de autorisatie wordt gesimuleerd."
                : "Account-specific data such as your own tickets and personal preferences remains tied to your real account; only authorization is simulated."}
            </p>
            <Button type="submit" variant="secondary">
              {nl ? "Voorbeeld starten" : "Start preview"}
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}
