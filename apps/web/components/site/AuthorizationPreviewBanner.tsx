import Link from "@/components/ui/Link";
import type { Locale } from "@vtk/i18n";
import { getAuthorizationPreview } from "@/lib/session";
import { AUTHORIZATION_PREVIEW_STOP_PATH } from "@/lib/authorization-preview-constants";

export async function AuthorizationPreviewBanner({ locale }: { locale: Locale }) {
  const preview = await getAuthorizationPreview();
  if (!preview) return null;

  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const roleNames = preview.roles.map((role) => (nl ? role.nameNl : role.nameEn));
  const groupNames = preview.groups.map((group) => {
    const name = nl ? group.nameNl : group.nameEn;
    return group.role === "LEAD" ? `${name} (${nl ? "verantwoordelijke" : "lead"})` : name;
  });
  const context = [...roleNames, ...groupNames];

  return (
    // Zwevend onderaan en niet meer in de flow onder de kop. Daar schoof de
    // homepagehero (die onder de transparante kop doorloopt) eroverheen: de
    // balk was weg en de kop verloor haar donkere achtergrond. Vast in beeld is
    // ze op elke pagina en bij elke scrollpositie de uitweg. Zie
    // `.vtk-preview-bar` in vtk-site-chrome.css.
    <aside className="vtk-preview-bar" role="status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-sm">
          <strong>{nl ? "Alleen-lezen autorisatievoorbeeld" : "Read-only authorization preview"}</strong>
          <span className="ml-2">
            {context.length > 0
              ? context.join(" · ")
              : nl
                ? "Geen rollen of posten"
                : "No roles or posts"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <Link className="rounded-full px-3 py-1.5 hover:bg-amber-100" href={`${base}/`}>
            {nl ? "Frontend" : "Frontend"}
          </Link>
          <Link className="rounded-full px-3 py-1.5 hover:bg-amber-100" href={`${base}/admin`}>
            Admin
          </Link>
          <form action={AUTHORIZATION_PREVIEW_STOP_PATH} method="post">
            <input type="hidden" name="locale" value={locale} />
            <button
              type="submit"
              className="rounded-full border border-amber-400 bg-white px-3 py-1.5 hover:bg-amber-100"
            >
              {nl ? "Voorbeeld stoppen" : "Stop preview"}
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
