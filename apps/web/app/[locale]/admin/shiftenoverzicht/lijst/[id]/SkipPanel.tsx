import { formatCount } from "@/lib/praesidiumShifts/stats";
import { SkipPersonPicker, SkipPostForm, SkipToggle } from "./SkipControls";

export type SkipPanelMember = {
  userId: string;
  name: string;
  posts: string[];
  count: number;
  skipped: boolean;
  skipReason: string | null;
};

/**
 * Wie op deze lijst niet meetelt. Uitleg bovenaan, dan de twee manieren om
 * iemand toe te voegen (een hele post of één persoon), en de lijst van wie er
 * nu overgeslagen wordt met hoeveel shiften er daardoor niet tellen.
 */
export function SkipPanel({
  locale,
  listId,
  members,
  posts,
  errorMessages,
}: {
  locale: "nl" | "en";
  listId: string;
  members: SkipPanelMember[];
  posts: { id: string; name: string; members: number }[];
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const skipped = members.filter((m) => m.skipped).sort((a, b) => a.name.localeCompare(b.name, "nl"));
  const counted = members.filter((m) => !m.skipped);

  return (
    <div className="space-y-3">
      <section className="space-y-3 rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated p-4">
        <p className="max-w-[62ch] text-sm text-vtk-body">
          {nl
            ? "Wie je hier overslaat, telt niet mee op deze lijst: de vakjes tellen niet, en die persoon staat niet in het gemiddelde, de richtlijn of de bellijst. Bijvoorbeeld logistiek, die op 24UL als logistiek werkt. In het overzicht wordt die persoon vergeleken met het gemiddelde zonder deze lijst."
            : "Whoever you skip here does not count on this list: their cells do not count, and they are left out of the average, the target and the call list. For example logistics, who work as logistics at 24UL. In the overview they are compared with the average without this list."}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <SkipPostForm locale={locale} listId={listId} posts={posts} errorMessages={errorMessages} />
          <span className="text-xs text-vtk-muted">{nl ? "of" : "or"}</span>
          <SkipPersonPicker locale={locale} listId={listId} people={counted} />
        </div>
      </section>

      <section className="rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated">
        <h2 className="px-4 pt-3.5 pb-2 text-[15px] font-semibold">
          {nl ? "Overgeslagen op deze lijst" : "Skipped on this list"}{" "}
          <span className="font-normal text-vtk-muted">({skipped.length})</span>
        </h2>
        {skipped.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-vtk-muted">{nl ? "Iedereen telt mee." : "Everyone counts."}</p>
        ) : (
          <ul>
            {skipped.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--rule-soft)] px-4 py-2.5 text-sm">
                <span>
                  <span className="font-semibold">{m.name}</span>{" "}
                  <span className="text-xs text-vtk-muted">
                    {[
                      m.skipReason ?? m.posts.join(", "),
                      m.count > 0
                        ? nl
                          ? `${formatCount(m.count, locale)} ${m.count === 1 ? "shift telt" : "shiften tellen"} niet`
                          : `${formatCount(m.count, locale)} shifts not counted`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <SkipToggle locale={locale} listId={listId} userId={m.userId} name={m.name} skipped />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
