import { formatCount } from "@/lib/praesidiumShifts/stats";
import { CountFullyButton, SkipAddControls, WeightInput } from "./SkipControls";

export type SkipPanelMember = {
  userId: string;
  name: string;
  posts: string[];
  /** Shiften zoals ze op de lijst staan, nog zonder `weight`. */
  count: number;
  /** 1 volledig, 0.5 voor de helft, 0 overgeslagen. */
  weight: number;
  skipReason: string | null;
};

/**
 * Wie op deze lijst niet of maar voor een deel meetelt. Uitleg bovenaan, dan
 * de twee manieren om iemand toe te voegen (een hele post of één persoon) met
 * het percentage ervoor, en de lijst van wie er nu minder meetelt, met het
 * percentage om aan te passen en hoeveel shiften er daardoor niet tellen.
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
  const weighted = members
    .filter((m) => m.weight < 1)
    .sort((a, b) => a.weight - b.weight || a.name.localeCompare(b.name, "nl"));
  const counted = members.filter((m) => m.weight >= 1);

  const countNote = (m: SkipPanelMember) => {
    if (m.count === 0) return null;
    if (m.weight === 0) {
      return nl
        ? `${formatCount(m.count, locale)} ${m.count === 1 ? "shift telt" : "shiften tellen"} niet`
        : `${formatCount(m.count, locale)} shifts not counted`;
    }
    return nl
      ? `${formatCount(m.count * m.weight, locale)} van ${formatCount(m.count, locale)} ${m.count === 1 ? "shift telt" : "shiften tellen"}`
      : `${formatCount(m.count * m.weight, locale)} of ${formatCount(m.count, locale)} shifts count`;
  };

  return (
    <div className="space-y-3">
      <section className="space-y-3 rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated p-4">
        <p className="max-w-[62ch] text-sm text-vtk-body">
          {nl
            ? "Wie je hier op 0% zet, wordt overgeslagen: de vakjes tellen niet, en die persoon staat niet in het gemiddelde, de richtlijn of de bellijst. Bijvoorbeeld logistiek, die op 24UL als logistiek werkt. Op 50% weegt deze lijst voor die persoon half: de helft van de shiften telt, en die persoon wordt vergeleken met de helft van het gemiddelde. Een verschil op deze lijst wordt dus ook half zo groot."
            : "Whoever you set to 0% here is skipped: their cells do not count, and they are left out of the average, the target and the call list. For example logistics, who work as logistics at 24UL. At 50% this list weighs half for that person: half of their shifts count, and they are compared with half of the average. A difference on this list is therefore also halved."}
        </p>
        <SkipAddControls
          locale={locale}
          listId={listId}
          posts={posts}
          people={counted.map((m) => ({ userId: m.userId, name: m.name, posts: m.posts }))}
          errorMessages={errorMessages}
        />
      </section>

      <section className="rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated">
        <h2 className="px-4 pt-3.5 pb-2 text-[15px] font-semibold">
          {nl ? "Overgeslagen of voor een deel" : "Skipped or partly counted"}{" "}
          <span className="font-normal text-vtk-muted">({weighted.length})</span>
        </h2>
        {weighted.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-vtk-muted">{nl ? "Iedereen telt volledig mee." : "Everyone counts in full."}</p>
        ) : (
          <ul>
            {weighted.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--rule-soft)] px-4 py-2.5 text-sm">
                <span>
                  <span className="font-semibold">{m.name}</span>{" "}
                  <span className="text-xs text-vtk-muted">
                    {[m.skipReason ?? m.posts.join(", "), countNote(m)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {/* Een nieuwe sleutel na het opslaan zet het veld op de bewaarde waarde. */}
                  <WeightInput
                    key={m.weight}
                    locale={locale}
                    listId={listId}
                    userId={m.userId}
                    name={m.name}
                    weight={m.weight}
                    errorMessages={errorMessages}
                  />
                  <CountFullyButton locale={locale} listId={listId} userId={m.userId} name={m.name} errorMessages={errorMessages} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
