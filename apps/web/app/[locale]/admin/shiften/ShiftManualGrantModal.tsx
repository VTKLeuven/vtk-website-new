"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@vtk/i18n";
import { Button, FormError, Input, Label, Select } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import { grantManualShiftsAction } from "@/app/actions/manualShifts";

type SearchUser = {
  id: string;
  name: string;
  email: string;
  rNumber: string | null;
};

export function ShiftManualGrantModal({
  locale,
  postOptions,
  selectedYear,
  availableYears,
  onClose,
  onSaved,
}: {
  locale: Locale;
  postOptions: string[];
  selectedYear: number;
  availableYears: number[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const nl = locale === "nl";
  const showToast = useToast();

  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [count, setCount] = useState("1");
  const [post, setPost] = useState("");
  const [year, setYear] = useState(String(selectedYear));
  const [reason, setReason] = useState(nl ? "Overdracht vorige website" : "Transfer from previous website");
  const [reward, setReward] = useState("0");
  const [payedOut, setPayedOut] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced zoekopdracht naar gebruikers
  useEffect(() => {
    const q = search.trim();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (selectedUser || q.length < 2) {
        setResults([]);
        return;
      }
      try {
        const resp = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (resp.ok) {
          setResults((await resp.json()) as SearchUser[]);
        }
      } catch {
        /* genegeerd bij abort */
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, selectedUser]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) {
      setError(nl ? "Kies een gebruiker." : "Please select a user.");
      return;
    }

    const parsedCount = parseInt(count, 10);
    if (Number.isNaN(parsedCount) || parsedCount < 1 || parsedCount > 100) {
      setError(nl ? "Aantal moet een getal tussen 1 en 100 zijn." : "Count must be a number between 1 and 100.");
      return;
    }

    const parsedReward = parseInt(reward, 10);
    if (Number.isNaN(parsedReward) || parsedReward < 0) {
      setError(nl ? "Bonnetjes moet een getal >= 0 zijn." : "Vouchers must be >= 0.");
      return;
    }

    if (!reason.trim()) {
      setError(nl ? "Vul een reden of toelichting in." : "Please enter a reason.");
      return;
    }

    setBusy(true);
    setError(null);

    const res = await grantManualShiftsAction({
      userId: selectedUser.id,
      count: parsedCount,
      post: post === "" ? null : post,
      academicYear: parseInt(year, 10),
      reason: reason.trim(),
      reward: parsedReward,
      payedOut,
    });

    setBusy(false);

    if (res.success) {
      showToast({
        message: nl ? "Extra shiften toegekend" : "Extra shifts granted",
        variant: "success",
      });
      onSaved();
    } else {
      setError(res.error);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="grant-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-vtk-surface-elevated p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-vtk-navy/5 pb-3">
          <h2 id="grant-modal-title" className="text-lg font-semibold text-vtk-ink">
            {nl ? "Extra shiften manueel toekennen" : "Manually grant extra shifts"}
          </h2>
          <button
            type="button"
            className="text-vtk-muted hover:text-vtk-body"
            onClick={onClose}
            aria-label={nl ? "Sluiten" : "Close"}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && <FormError>{error}</FormError>}

          {/* Gebruiker selecteren */}
          <div>
            <Label>{nl ? "Lid / Gebruiker *" : "Member / User *"}</Label>
            {selectedUser ? (
              <div className="mt-1 flex items-center justify-between rounded-lg border border-vtk-blue/30 bg-vtk-blue-soft/30 px-3 py-2 text-sm">
                <div>
                  <span className="font-semibold text-vtk-ink">{selectedUser.name}</span>
                  <span className="ml-2 text-xs text-vtk-muted">
                    {selectedUser.email}
                    {selectedUser.rNumber ? ` (${selectedUser.rNumber})` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUser(null);
                    setSearch("");
                  }}
                  className="ml-2 text-xs text-vtk-danger hover:underline"
                >
                  {nl ? "Wijzigen" : "Change"}
                </button>
              </div>
            ) : (
              <div className="relative mt-1">
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={nl ? "Zoek op naam, e-mail of r-nummer..." : "Search by name, email or r-number..."}
                  autoFocus
                />
                {results.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-vtk-navy/10 bg-vtk-surface-elevated shadow-lg">
                    {results.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUser(u);
                            setResults([]);
                          }}
                          className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-vtk-blue-muted"
                        >
                          <span className="font-medium text-vtk-ink">{u.name}</span>
                          <span className="text-xs text-vtk-muted">
                            {u.email}
                            {u.rNumber ? ` • ${u.rNumber}` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Aantal shiften */}
            <div>
              <Label>{nl ? "Aantal shiften *" : "Number of shifts *"}</Label>
              <Input
                type="number"
                min="1"
                max="100"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                required
              />
            </div>

            {/* Post */}
            <div>
              <Label>{nl ? "Post (optioneel)" : "Group (optional)"}</Label>
              <Select value={post} onChange={(e) => setPost(e.target.value)}>
                <option value="">{nl ? "Geen post" : "No group"}</option>
                {postOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Academiejaar */}
            <div>
              <Label>{nl ? "Academiejaar *" : "Academic year *"}</Label>
              <Select value={year} onChange={(e) => setYear(e.target.value)}>
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}–{y + 1}
                  </option>
                ))}
              </Select>
            </div>

            {/* Bonnetjes per shift */}
            <div>
              <Label>{nl ? "Bonnetjes per shift" : "Vouchers per shift"}</Label>
              <Input
                type="number"
                min="0"
                value={reward}
                onChange={(e) => setReward(e.target.value)}
              />
            </div>
          </div>

          {/* Reeds uitbetaald optie als reward > 0 */}
          {parseInt(reward, 10) > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-vtk-blue-muted p-2 text-sm text-vtk-body">
              <input
                type="checkbox"
                id="manual-payed-out"
                checked={payedOut}
                onChange={(e) => setPayedOut(e.target.checked)}
                className="h-4 w-4 rounded border-vtk-navy/20 text-vtk-blue"
              />
              <label htmlFor="manual-payed-out" className="cursor-pointer text-xs">
                {nl
                  ? "Bonnetjes reeds uitbetaald op de vorige website (geen openstaand saldo aanmaken)"
                  : "Vouchers already paid on previous website (do not create outstanding balance)"}
              </label>
            </div>
          )}

          {/* Reden / toelichting */}
          <div>
            <Label>{nl ? "Reden / toelichting *" : "Reason / note *"}</Label>
            <Input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={nl ? "bv. Overdracht vorige website" : "e.g. Migration previous website"}
              required
            />
            <p className="mt-1 text-xs text-vtk-muted">
              {nl
                ? "Wordt opgenomen in het adminlogboek en getoond in de shifthistoriek."
                : "Will be recorded in the admin audit log and shown in shift history."}
            </p>
          </div>

          <div className="mt-6 flex justify-end gap-2 border-t border-vtk-navy/5 pt-3">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              {nl ? "Annuleren" : "Cancel"}
            </Button>
            <Button type="submit" disabled={busy || !selectedUser}>
              {busy
                ? nl
                  ? "Toekennen..."
                  : "Granting..."
                : nl
                  ? "Shiften toekennen"
                  : "Grant shifts"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
