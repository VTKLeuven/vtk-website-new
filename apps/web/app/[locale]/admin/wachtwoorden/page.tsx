import { notFound } from "next/navigation";
import Link from "next/link";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requireAnyPermission } from "@/lib/session";
import { getVaultConfig, vaultPublicUrl } from "@/lib/vault/config";
import { vaultPostsForSession } from "@/lib/vault/access";
import { listVaultItems } from "@/lib/vault/items";
import { VaultItems, type ItemRow } from "./VaultItems";

/**
 * De wachtwoorden van je eigen post(en).
 *
 * Bewust geen tweede kluis: dit scherm schrijft rechtstreeks in Vaultwarden, en
 * wat je hier aanmaakt staat meteen in de Bitwarden-extensie en -app van
 * iedereen in die post. Zie `docs/wachtwoorden.md`.
 */
export default async function AdminVault({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ post?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const session = await requireAnyPermission(["vault.editOwn", "vault.manage"]);

  const posts = await vaultPostsForSession(session);
  const { post: requested } = await searchParams;
  const selected = posts.find((p) => p.vaultPostId === requested) ?? posts[0] ?? null;

  const cfg = await getVaultConfig();
  const clientUrl = await vaultPublicUrl();

  let items: ItemRow[] = [];
  let loadError: string | null = null;
  if (cfg && selected?.collectionId) {
    const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    try {
      items = (await listVaultItems(cfg, selected.collectionId)).map((i) => ({
        id: i.id,
        name: i.name,
        username: i.username,
        uri: i.uri,
        notes: i.notes,
        changedLabel: i.revisionDate ? dateFmt.format(i.revisionDate) : null,
      }));
    } catch {
      loadError = nl
        ? "De wachtwoordkluis is op dit moment niet bereikbaar."
        : "The password vault cannot be reached right now.";
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{nl ? "Wachtwoorden" : "Passwords"}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {nl
            ? "De gedeelde wachtwoorden van je post. Wie dit jaar in de post zit, ziet ze automatisch; wie de post verlaat, verliest ze automatisch."
            : "Your post's shared passwords. Whoever is in the post this year sees them automatically; whoever leaves loses them automatically."}
        </p>
      </div>

      {clientUrl && (
        <div className="rounded-2xl border border-vtk-blue/15 bg-white p-5 text-sm">
          <p className="font-medium text-vtk-ink">
            {nl ? "Gebruik ze in je browser of op je telefoon" : "Use them in your browser or on your phone"}
          </p>
          <p className="mt-1 text-zinc-600">
            {nl
              ? "Installeer de Bitwarden-extensie of -app, kies \"zelf gehost\" en vul dit adres in. Aanmelden doe je met je VTK-account."
              : "Install the Bitwarden extension or app, choose \"self-hosted\" and enter this address. You sign in with your VTK account."}
          </p>
          <p className="mt-2 font-mono text-xs text-vtk-ink">{clientUrl}</p>
        </div>
      )}

      {!cfg && (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          {nl
            ? "De wachtwoordkluis is nog niet ingesteld. Een superadmin doet dat bij Admin -> Kluisbeheer."
            : "The password vault is not set up yet. A super admin can do that at Admin -> Vault management."}
        </p>
      )}

      {posts.length === 0 ? (
        <p className="rounded-2xl border border-vtk-blue/15 bg-white p-6 text-sm text-zinc-600">
          {nl
            ? "Geen van je posten is aan de wachtwoordkluis gekoppeld. Vraag IT om je post te koppelen."
            : "None of your posts is linked to the password vault. Ask IT to link your post."}
        </p>
      ) : (
        <>
          {posts.length > 1 && (
            <nav className="flex flex-wrap gap-2" aria-label={nl ? "Kies een post" : "Choose a post"}>
              {posts.map((p) => {
                const active = p.vaultPostId === selected?.vaultPostId;
                return (
                  <Link
                    key={p.vaultPostId}
                    href={`/${locale}/admin/wachtwoorden?post=${p.vaultPostId}`}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "rounded-full border px-4 py-1.5 text-sm transition-colors",
                      active
                        ? "border-vtk-blue/30 bg-vtk-blue-soft font-medium text-vtk-ink"
                        : "border-vtk-blue/15 text-zinc-600 hover:bg-vtk-blue-soft/60",
                    ].join(" ")}
                  >
                    {p.groupName}
                  </Link>
                );
              })}
            </nav>
          )}

          {loadError && (
            <p className="rounded-2xl border border-red-300 bg-red-50 p-5 text-sm text-red-900">
              {loadError}
            </p>
          )}

          {selected && !selected.collectionId && (
            <p className="rounded-2xl border border-vtk-blue/15 bg-white p-6 text-sm text-zinc-600">
              {nl
                ? "Deze post is gekoppeld maar nog niet gesynchroniseerd. Binnen enkele minuten staat de map klaar."
                : "This post is linked but not synchronised yet. The folder will be ready within a few minutes."}
            </p>
          )}

          {selected?.collectionId && !loadError && (
            <VaultItems
              nl={nl}
              vaultPostId={selected.vaultPostId}
              postName={selected.groupName}
              items={items}
            />
          )}
        </>
      )}
    </div>
  );
}
