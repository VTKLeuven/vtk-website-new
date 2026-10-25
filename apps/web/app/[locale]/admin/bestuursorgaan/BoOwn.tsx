"use client";

import { IconAnchor } from "@/components/ui/IconButton";
import { ExternalLinkIcon } from "@/components/ui/icons";
import type { OwnPost } from "@/lib/bo/own";
import { boRange, Stand, useFormat, type Locale } from "./BoParts";

/*
 * "Mijn budgetten" (/admin/bestuursorgaan/mijn): per eigen post dezelfde tabel
 * als de lijstweergave van Groep 5, met dezelfde stand en dezelfde BO-kolom
 * (`BoParts.tsx`), zodat een post en Groep 5 over één activiteit hetzelfde
 * lezen. Een rij opent niets: het detail van een activiteit is het rekenblad,
 * en dat opent het icoon in Drive.
 */

export function BoOwn({ posts, locale }: { posts: OwnPost[]; locale: Locale }) {
  const f = useFormat(locale);
  const { nl } = f;
  return (
    <div className="vtk-bo-l vtk-bo-own">
      {posts.map((post) => {
        const { stats } = post;
        const facts = [
          stats.due > 0
            ? nl
              ? `${stats.done} van ${stats.due} resultaten binnen`
              : `${stats.done} of ${stats.due} results in`
            : null,
          stats.open > 0 ? `${stats.open} open` : null,
          stats.upcoming > 0 ? (nl ? `${stats.upcoming} komt nog` : `${stats.upcoming} upcoming`) : null,
        ].filter(Boolean);
        return (
          <section key={post.key} aria-labelledby={`bo-own-${post.key}`}>
            <div className="vtk-bo-own-head">
              <h2 id={`bo-own-${post.key}`}>{post.name}</h2>
              {facts.length > 0 && <span>{facts.join(" · ")}</span>}
            </div>
            {post.dossiers.length === 0 ? (
              <p className="vtk-bo-own-empty">
                {nl
                  ? `Nog geen budget van ${post.name} langs het BO dit werkingsjaar.`
                  : `No budget from ${post.name} has passed the board meeting this working year yet.`}
              </p>
            ) : (
              <div className="vtk-bo-l-wrap">
                <table className="vtk-bo-l-table">
                  <thead>
                    <tr>
                      <th>{nl ? "Activiteit" : "Activity"}</th>
                      <th>BO</th>
                      <th className="num">Budget</th>
                      <th className="num">{nl ? "Resultaat" : "Result"}</th>
                      <th>{nl ? "Stand" : "Status"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {post.dossiers.map((d) => {
                      const sheet = d.results.at(-1) ?? d.budgets.at(-1);
                      const others = d.postNames.filter((_, i) => d.postKeys[i] !== post.key);
                      return (
                        <tr key={d.key} className="vtk-bo-l-row">
                          <td>
                            <span className="vtk-bo-own-act">
                              <span className="min-w-0">
                                <b className="font-semibold text-vtk-ink">{d.activity}</b>
                                {others.length > 0 && (
                                  <span className="block text-xs text-vtk-muted">
                                    {nl ? "met" : "with"} {others.join(" + ")}
                                  </span>
                                )}
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
                            </span>
                          </td>
                          <td data-label="BO" className="text-xs">{boRange(d, f)}</td>
                          <td data-label="Budget" className="num">{f.euro(d.budgetCents)}</td>
                          <td data-label={nl ? "Resultaat" : "Result"} className="num">
                            {d.results.length ? f.euro(d.resultCents) : "–"}
                          </td>
                          <td data-label={nl ? "Stand" : "Status"}>
                            <Stand d={d} f={f} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
