import Link from "@/components/ui/Link";
import { IconAnchor } from "@/components/ui/IconButton";
import { ExternalLinkIcon } from "@/components/ui/icons";
import type { OwnPost } from "@/lib/bo/own";

/*
 * Op het dashboard (/admin): de resultaten die de eigen post nog naar het BO
 * moet brengen. Enkel wat open staat, en niets als er niets open staat; de
 * rest staat op "Mijn budgetten". Zie `lib/bo/own.ts`.
 */

/** Per post zoveel regels; wat erover gaat, staat op "Mijn budgetten". */
const SHOWN = 5;

export function BoDueCard({ posts, base, nl }: { posts: OwnPost[]; base: string; nl: boolean }) {
  if (posts.length === 0) return null;
  const href = `${base}/admin/bestuursorgaan/mijn`;
  const single = posts.length === 1;
  return (
    <section className="vtk-bo-due" aria-labelledby="bo-due-title">
      <div className="vtk-bo-due-head">
        <h2 id="bo-due-title">
          {nl ? "Nog te brengen resultaten" : "Results still to bring"}
        </h2>
        <Link href={href}>{nl ? "Alle budgetten van je post" : "All budgets of your post"}</Link>
      </div>
      {posts.map((post) => {
        const more = post.dossiers.length - SHOWN;
        return (
          <div key={post.key} className="vtk-bo-due-post">
            {!single && <h3>{post.name}</h3>}
            <ul>
              {post.dossiers.slice(0, SHOWN).map((d) => {
                const budget = d.budgets[0];
                const sheet = d.budgets.at(-1);
                const days = d.overdueDays ?? 0;
                // Een schriftelijke goedkeuring heeft geen BO-datum, dus ook geen dagen.
                const meta =
                  d.date === null || !budget
                    ? nl
                      ? "budget schriftelijk goedgekeurd"
                      : "budget approved in writing"
                    : nl
                      ? `budget op ${budget.meetingLabel} · ${days === 1 ? "1 dag" : `${days} dagen`} open`
                      : `budget at ${budget.meetingLabel} · open ${days === 1 ? "1 day" : `${days} days`}`;
                return (
                  <li key={d.key}>
                    <span className="min-w-0 flex-1">
                      <b>{d.activity}</b>
                      <span>{meta}</span>
                    </span>
                    {sheet && (
                      <IconAnchor
                        href={sheet.webUrl}
                        target="_blank"
                        rel="noreferrer"
                        label={nl ? "Rekenblad openen in Drive" : "Open the spreadsheet in Drive"}
                        srLabel={nl ? `Rekenblad openen in Drive: ${d.activity}` : `Open the spreadsheet in Drive: ${d.activity}`}
                      >
                        <ExternalLinkIcon />
                      </IconAnchor>
                    )}
                  </li>
                );
              })}
            </ul>
            {more > 0 && (
              <Link href={href} className="vtk-bo-due-more">
                {nl ? `en nog ${more}` : `and ${more} more`}
              </Link>
            )}
          </div>
        );
      })}
    </section>
  );
}
