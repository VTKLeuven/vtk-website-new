"use client";

import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { setVaultPostAction, syncVaultAction, unlinkVaultPostAction } from "../actions";

export type PostRow = {
  groupId: string;
  name: string;
  memberCount: number;
  linked: boolean;
  lastSyncLabel: string | null;
  lastError: string | null;
  /** Per status het aantal leden, om de wachtstand zichtbaar te maken. */
  invited: number;
  confirmed: number;
};

/**
 * Kluisbeheer voor IT: welke posten gekoppeld zijn en waar de synchronisatie
 * staat. De wachtwoorden zelf staan hier niet; die horen bij de post
 * (/admin/wachtwoorden).
 */
export function VaultAdmin({ nl, posts }: { nl: boolean; posts: PostRow[] }) {
  const t = nl
    ? {
        posts: "Gekoppelde posten",
        intro:
          "Een gekoppelde post krijgt een eigen map in de kluis. Iedereen die dit werkingsjaar in de post zit, wordt uitgenodigd; wie de post verlaat, wordt eruit gehaald.",
        post: "Post",
        members: "Leden",
        status: "Status",
        lastSync: "Laatste sync",
        linked: "Gekoppeld",
        link: "Koppelen",
        unlink: "Loskoppelen",
        waiting: "wacht op eerste login",
        active: "actief",
        never: "nog niet",
        sync: "Nu synchroniseren",
        syncing: "Bezig met synchroniseren...",
        synced: "Synchronisatie afgerond.",
      }
    : {
        posts: "Linked posts",
        intro:
          "A linked post gets its own folder in the vault. Everyone in the post this working year is invited; whoever leaves the post is removed.",
        post: "Post",
        members: "Members",
        status: "Status",
        lastSync: "Last sync",
        linked: "Linked",
        link: "Link",
        unlink: "Unlink",
        waiting: "waiting for first sign-in",
        active: "active",
        never: "not yet",
        sync: "Synchronise now",
        syncing: "Synchronising...",
        synced: "Synchronisation finished.",
      };

  const errorMessages = nl
    ? {
        NOT_CONFIGURED: "De kluis is nog niet ingesteld; vul eerst de configuratie in.",
        SYNC_PARTIAL:
          "Niet alles is gelukt. Kijk per post de foutmelding na; de volgende ronde probeert het opnieuw.",
        INVALID_INPUT: "Niet opgeslagen: onbekende post.",
      }
    : {
        NOT_CONFIGURED: "The vault is not set up yet; fill in the configuration first.",
        SYNC_PARTIAL:
          "Not everything succeeded. Check the error per post; the next round will try again.",
        INVALID_INPUT: "Not saved: unknown post.",
      };

  return (
    <div className="space-y-6">
      <SaveForm
        action={syncVaultAction}
        submitLabel={t.sync}
        savingLabel={t.syncing}
        savedMessage={t.synced}
        errorMessages={errorMessages}
        fallbackErrorMessage={
          nl ? "Synchroniseren is mislukt." : "Synchronisation failed."
        }
      />

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">{t.posts}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t.intro}</p>
        </div>

        {/* `relative`: zie CLAUDE.md over sr-only in een horizontale scroller. */}
        <div className="relative overflow-x-auto rounded-2xl border border-vtk-blue/15 bg-white">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t.post}</th>
                <th className="px-4 py-3 font-medium">{t.members}</th>
                <th className="px-4 py-3 font-medium">{t.status}</th>
                <th className="px-4 py-3 font-medium">{t.lastSync}</th>
                <th className="px-4 py-3 text-right font-medium">
                  <span className="sr-only">{t.link}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.groupId} className="border-b border-vtk-blue/5 last:border-0">
                  <td className="px-4 py-3 font-medium text-vtk-ink">{p.name}</td>
                  <td className="px-4 py-3 text-zinc-600">{p.memberCount}</td>
                  <td className="px-4 py-3 text-zinc-600">
                    {p.linked ? (
                      <span>
                        {p.confirmed} {t.active}
                        {p.invited > 0 && (
                          <>
                            {", "}
                            <span className="text-amber-700">
                              {p.invited} {t.waiting}
                            </span>
                          </>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                    {p.lastError && (
                      <span className="mt-1 block text-xs text-red-700">{p.lastError}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{p.lastSyncLabel ?? t.never}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <LinkToggle nl={nl} post={p} labels={t} errorMessages={errorMessages} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/**
 * Koppelen is een gewone opslaan-knop; loskoppelen krijgt een
 * bevestigingsdialoog, want het haalt in één klik de toegang weg bij iedereen in
 * die post (zie CLAUDE.md over destructieve acties).
 */
function LinkToggle({
  nl,
  post,
  labels,
  errorMessages,
}: {
  nl: boolean;
  post: PostRow;
  labels: { link: string; unlink: string };
  errorMessages: Record<string, string>;
}) {
  if (post.linked) {
    return (
      <DeleteButton
        action={unlinkVaultPostAction}
        fields={{ groupId: post.groupId }}
        title={nl ? "Post loskoppelen?" : "Unlink post?"}
        description={
          nl
            ? `${post.memberCount} leden van ${post.name} verliezen bij de volgende synchronisatie hun toegang tot de wachtwoorden van deze post. De wachtwoorden zelf blijven in de kluis staan en andere posten veranderen niet; koppel je de post later opnieuw, dan staat alles er nog.`
            : `${post.memberCount} members of ${post.name} lose access to this post's passwords at the next synchronisation. The passwords themselves stay in the vault and other posts are unaffected; link the post again later and everything is still there.`
        }
        confirmLabel={labels.unlink}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        successMessage={
          nl
            ? "Post losgekoppeld. De toegang verdwijnt bij de volgende synchronisatie."
            : "Post unlinked. Access disappears at the next synchronisation."
        }
      >
        {labels.unlink}
      </DeleteButton>
    );
  }

  return (
    <SaveForm
      action={setVaultPostAction}
      submitLabel={labels.link}
      savingLabel={nl ? "Bezig..." : "Working..."}
      savedMessage={
        nl
          ? "Post gekoppeld. De leden krijgen een uitnodiging bij de volgende synchronisatie."
          : "Post linked. Members receive an invitation at the next synchronisation."
      }
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
      resetOnSuccess={false}
    >
      <input type="hidden" name="groupId" value={post.groupId} />
      <input type="hidden" name="enabled" value="1" />
    </SaveForm>
  );
}
