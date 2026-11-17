"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmDialog } from "@vtk/ui";
import { SearchPicker } from "@/components/admin/SearchPicker";
import { useToast } from "@/components/ui/toast";
import { UNSENT, useUnsentGuard } from "@/components/ui/unsentGuard";
import { moveAccountsAction } from "./actions";

export type OuAccount = {
  email: string;
  name: string | null;
  ou: string;
  suspended: boolean;
  /** De naam van het gekoppelde lid op de site. */
  member: string | null;
  /** Een post of werkgroep van dit werkingsjaar. */
  post: string | null;
};

const ALL = "__all__";

/** Zonder accenten en hoofdletters. */
function fold(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Accounts per organisatie-eenheid, aanvinken (shift en Ctrl/Cmd zoals op het
 * overzicht van de groepsadressen) en in één keer verplaatsen.
 */
export function OuManager({
  nl,
  accounts,
  orgUnits,
  restrictedOrgUnits,
}: {
  nl: boolean;
  accounts: OuAccount[];
  orgUnits: string[];
  /** De OU's waarin de site kiesploegleden beperkt; daarheen verhuizen verdient een waarschuwing. */
  restrictedOrgUnits: string[];
}) {
  const [ou, setOu] = useState(ALL);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const unsent = useUnsentGuard();
  const router = useRouter();

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of accounts) map.set(a.ou, (map.get(a.ou) ?? 0) + 1);
    return map;
  }, [accounts]);

  const visible = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    return accounts.filter(
      (a) =>
        (ou === ALL || a.ou === ou) &&
        words.every((w) => fold(`${a.email} ${a.name ?? ""} ${a.member ?? ""} ${a.post ?? ""}`).includes(w)),
    );
  }, [accounts, ou, query]);
  const ordered = visible.map((a) => a.email);
  const chosen = visible.filter((a) => selected.has(a.email));
  const allChecked = visible.length > 0 && chosen.length === visible.length;

  function pick(email: string, event: { shiftKey: boolean }) {
    const from = anchor ? ordered.indexOf(anchor) : -1;
    const to = ordered.indexOf(email);
    if (event.shiftKey && from >= 0 && to >= 0) {
      const [a, b] = from < to ? [from, to] : [to, from];
      const on = selected.has(anchor as string);
      setSelected((prev) => {
        const next = new Set(prev);
        for (const e of ordered.slice(a, b + 1)) {
          if (on) next.add(e);
          else next.delete(e);
        }
        return next;
      });
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
    setAnchor(email);
  }

  function move() {
    const emails = chosen.map((a) => a.email);
    startTransition(async () => {
      const result = await unsent.run(() => moveAccountsAction(emails, target));
      setConfirming(false);
      if (result === UNSENT) return;
      if (result.status === "error") {
        const messages: Record<string, string> = nl
          ? {
              NOT_CONFIGURED: "Google Workspace is nog niet ingesteld.",
              NOTHING_SELECTED: "Niets aangevinkt.",
              UNKNOWN_OU: "Die organisatie-eenheid kent de site niet. Herlaad de pagina.",
              TOO_MANY: "Hoogstens 400 accounts per keer.",
            }
          : {
              NOT_CONFIGURED: "Google Workspace is not set up yet.",
              NOTHING_SELECTED: "Nothing selected.",
              UNKNOWN_OU: "The site does not know that organisational unit. Reload the page.",
              TOO_MANY: "At most 400 accounts at once.",
            };
        showToast({ message: messages[result.code], variant: "error", duration: 0 });
        return;
      }
      showToast(
        result.failed.length
          ? {
              message: nl
                ? `${result.moved} verplaatst; niet gelukt: ${result.failed.map((f) => `${f.email} (${f.error})`).join(", ")}`
                : `${result.moved} moved; failed: ${result.failed.map((f) => `${f.email} (${f.error})`).join(", ")}`,
              variant: "error",
              duration: 0,
            }
          : {
              message: nl ? `${result.moved} accounts verplaatst naar ${target}.` : `${result.moved} accounts moved to ${target}.`,
              variant: "success",
            },
      );
      setSelected(new Set());
      router.refresh();
    });
  }

  const chip = (value: string, label: string, n: number) => (
    <button
      key={value}
      type="button"
      aria-pressed={ou === value}
      onClick={() => {
        setOu(value);
        setSelected(new Set());
      }}
      className={[
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm",
        ou === value
          ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
          : "border-vtk-blue/15 bg-white text-vtk-ink hover:border-vtk-blue/30",
      ].join(" ")}
    >
      {label} <span className="tabular-nums">{n}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {chip(ALL, nl ? "Alle" : "All", accounts.length)}
        {orgUnits.filter((o) => counts.get(o)).map((o) => chip(o, o, counts.get(o) ?? 0))}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={nl ? "Zoek op adres, naam of post" : "Search address, name or post"}
          aria-label={nl ? "Zoek een account" : "Search an account"}
          className="ml-auto h-9 w-64 rounded-full border border-vtk-blue/15 bg-white px-4 text-sm"
        />
      </div>

      <div className="relative overflow-x-auto rounded-2xl border border-vtk-blue/15 bg-white">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allChecked}
                  aria-label={nl ? `Alle ${visible.length} accounts aanvinken` : `Select all ${visible.length} accounts`}
                  onChange={() => setSelected(allChecked ? new Set() : new Set(ordered))}
                />
              </th>
              <th className="px-4 py-3 font-medium">{nl ? "Account" : "Account"}</th>
              <th className="px-4 py-3 font-medium">{nl ? "Lid op de site" : "Site member"}</th>
              <th className="px-4 py-3 font-medium">{nl ? "Organisatie-eenheid" : "Organisational unit"}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => (
              <tr
                key={a.email}
                className={[
                  "cursor-pointer border-b border-vtk-blue/5 last:border-0 hover:bg-vtk-blue-soft/30",
                  selected.has(a.email) ? "bg-vtk-blue-soft/40" : "",
                ].join(" ")}
                onMouseDown={(e) => e.shiftKey && e.preventDefault()}
                onClick={(e) => pick(a.email, e)}
              >
                <td className="px-4 py-2 align-top">
                  <input
                    type="checkbox"
                    checked={selected.has(a.email)}
                    onChange={() => {}}
                    onClick={(e) => {
                      e.stopPropagation();
                      pick(a.email, e);
                    }}
                    aria-label={nl ? `Aanvinken: ${a.email}` : `Select: ${a.email}`}
                  />
                </td>
                <td className="px-4 py-2 align-top">
                  <span className="block break-all text-vtk-ink">{a.email}</span>
                  <span className="block text-xs text-zinc-500">
                    {a.name}
                    {a.suspended && <span className="text-amber-800"> · {nl ? "geschorst" : "suspended"}</span>}
                  </span>
                </td>
                <td className="px-4 py-2 align-top text-zinc-600">
                  {a.member ?? <span className="text-zinc-400">-</span>}
                  {a.post && <span className="block text-xs text-zinc-500">{a.post}</span>}
                </td>
                <td className="px-4 py-2 align-top text-zinc-600">{a.ou}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="px-4 py-4 text-sm text-zinc-500">{nl ? "Geen accounts voor deze filter." : "No accounts for this filter."}</p>
        )}
      </div>

      {chosen.length > 0 && (
        <div className="sticky bottom-4 z-30 flex flex-wrap items-center gap-3 rounded-2xl border border-vtk-blue/15 bg-white px-4 py-3 shadow-[0_10px_30px_-12px_rgba(10,15,31,0.35)]">
          <span className="text-sm font-medium tabular-nums text-vtk-ink">
            {nl ? `${chosen.length} aangevinkt` : `${chosen.length} selected`}
          </span>
          <div className="w-64 max-w-full">
            <SearchPicker
              options={orgUnits.map((o) => ({ value: o, label: o, hint: counts.get(o) ? String(counts.get(o)) : undefined }))}
              value={target}
              onChange={setTarget}
              placeholder={nl ? "Kies een organisatie-eenheid" : "Pick an organisational unit"}
              searchPlaceholder={nl ? "Zoek, bv. Praesidium" : "Search, e.g. Praesidium"}
              ariaLabel={nl ? "Organisatie-eenheid" : "Organisational unit"}
              emptyText={(q) =>
                nl
                  ? `Geen OU "${q}". Een nieuwe OU zet je eerst één keer in de Admin console.`
                  : `No OU "${q}". Put someone in a new OU once in the Admin console first.`
              }
            />
          </div>
          <Button type="button" size="sm" disabled={!target || pending} onClick={() => setConfirming(true)}>
            {nl ? "Verplaatsen" : "Move"}
          </Button>
          <button type="button" className="vtk-link ml-auto text-sm" onClick={() => setSelected(new Set())}>
            {nl ? "Selectie wissen" : "Clear selection"}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        destructive={false}
        title={
          nl ? `${chosen.length} accounts naar ${target} verplaatsen?` : `Move ${chosen.length} accounts to ${target}?`
        }
        description={
          <div className="space-y-2">
            <p>
              {nl
                ? "De regels van die organisatie-eenheid gelden meteen voor deze accounts: wie mag mailen, welke apps aan staan. Mail, bestanden en groepen blijven zoals ze zijn. Terugzetten kan hier opnieuw."
                : "The rules of that organisational unit apply to these accounts right away: who may send mail, which apps are on. Mail, files and groups stay as they are. You can move them back here."}
            </p>
            {restrictedOrgUnits.includes(target) && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                {nl
                  ? "Let op: dit is een OU waarin de site kiesploegleden beperkt. Wie hier staat, kan (bijna) niet meer mailen."
                  : "Note: this is an OU the site uses to restrict kiesploeg members. Whoever is here can (almost) no longer send mail."}
              </p>
            )}
          </div>
        }
        confirmLabel={pending ? (nl ? "Bezig..." : "Working...") : nl ? "Verplaatsen" : "Move"}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        pending={pending}
        onConfirm={move}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
