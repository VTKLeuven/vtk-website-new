"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { Locale } from "@vtk/i18n";
import { Button, Card, ConfirmDialog, Input } from "@vtk/ui";
import { IconButton } from "@/components/ui/IconButton";
import { TrashIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { deleteManualShiftGrantAction } from "@/app/actions/manualShifts";
import { YearPicker } from "./YearPicker";
import { ShiftManualGrantModal, type ManualGrantMode } from "./ShiftManualGrantModal";

export type ManualGrantRow = {
  id: string;
  createdAt: Date;
  userId: string;
  userName: string;
  userEmail: string;
  userRNumber: string | null;
  /** Negatief bij een afname: -1 is één shift afgenomen. */
  count: number;
  post: string | null;
  reason: string;
  academicYear: number;
  reward: number;
  payedOut: boolean;
  createdByName: string | null;
};

export function ShiftManual({
  locale,
  grants,
  postOptions,
  year,
  years,
}: {
  locale: Locale;
  grants: ManualGrantRow[];
  postOptions: string[];
  year: number;
  years: number[];
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const showToast = useToast();

  const [modal, setModal] = useState<ManualGrantMode | null>(null);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<ManualGrantRow | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const filteredGrants = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return grants;
    return grants.filter(
      (g) =>
        g.userName.toLowerCase().includes(q) ||
        g.userEmail.toLowerCase().includes(q) ||
        (g.userRNumber && g.userRNumber.toLowerCase().includes(q)) ||
        (g.post && g.post.toLowerCase().includes(q)) ||
        g.reason.toLowerCase().includes(q),
    );
  }, [grants, search]);

  async function handleDelete() {
    if (!deleting) return;
    setBusyDelete(true);

    const res = await deleteManualShiftGrantAction(deleting.id);
    setBusyDelete(false);

    if (res.success) {
      showToast({
        message:
          deleting.count < 0
            ? nl
              ? "Afname ingetrokken"
              : "Deduction revoked"
            : nl
              ? "Toekenning ingetrokken"
              : "Grant revoked",
        variant: "success",
      });
      setDeleting(null);
      router.refresh();
    } else {
      showToast({
        message: res.error,
        variant: "error",
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <YearPicker locale={locale} year={year} years={years} />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={nl ? "Zoek op lid, post of reden..." : "Search member, post or reason..."}
            className="w-64"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={() => setModal("deduct")}>
            {nl ? "Shiften afnemen" : "Deduct shifts"}
          </Button>
          <Button type="button" onClick={() => setModal("grant")}>
            {nl ? "+ Extra shiften toekennen" : "+ Grant extra shifts"}
          </Button>
        </div>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-vtk-blue-soft text-left">
            <tr>
              <th className="px-4 py-2">{nl ? "Datum" : "Date"}</th>
              <th className="px-4 py-2">{nl ? "Lid" : "Member"}</th>
              <th className="px-4 py-2">{nl ? "Aantal" : "Shifts"}</th>
              <th className="px-4 py-2">{nl ? "Post" : "Group"}</th>
              <th className="px-4 py-2">{nl ? "Reden / toelichting" : "Reason"}</th>
              <th className="px-4 py-2">{nl ? "Bonnetjes" : "Vouchers"}</th>
              <th className="px-4 py-2">{nl ? "Door" : "By"}</th>
              <th className="w-16 px-4 py-2 text-right">
                <span className="sr-only">{nl ? "Acties" : "Actions"}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredGrants.map((g) => (
              <tr key={g.id} className="border-t border-vtk-navy/10 hover:bg-vtk-blue-muted/50">
                <td className="px-4 py-2 text-xs text-vtk-muted whitespace-nowrap">
                  {format(g.createdAt, "dd/MM/yyyy HH:mm")}
                </td>
                <td className="px-4 py-2">
                  <div className="font-medium text-vtk-ink">{g.userName}</div>
                  <div className="text-xs text-vtk-muted">
                    {g.userEmail}
                    {g.userRNumber ? ` • ${g.userRNumber}` : ""}
                  </div>
                </td>
                <td
                  className={`px-4 py-2 font-semibold whitespace-nowrap tabular-nums ${
                    g.count < 0 ? "text-vtk-danger" : "text-vtk-blue"
                  }`}
                >
                  {g.count < 0 ? "\u2212" : "+"}
                  {Math.abs(g.count)}{" "}
                  {nl
                    ? Math.abs(g.count) === 1
                      ? "shift"
                      : "shiften"
                    : Math.abs(g.count) === 1
                      ? "shift"
                      : "shifts"}
                </td>
                <td className="px-4 py-2 text-vtk-body">{g.post ?? "—"}</td>
                <td className="px-4 py-2 text-vtk-body">{g.reason}</td>
                <td className="px-4 py-2 text-xs text-vtk-body whitespace-nowrap">
                  {g.count < 0
                    ? nl
                      ? "n.v.t."
                      : "n/a"
                    : g.reward > 0
                      ? `${g.reward} pp ${g.payedOut ? (nl ? "(uitbetaald)" : "(paid)") : nl ? "(openstaand)" : "(unpaid)"}`
                      : "0"}
                </td>
                <td className="px-4 py-2 text-xs text-vtk-muted">{g.createdByName ?? "—"}</td>
                <td className="px-4 py-2">
                  <IconButton
                    label={nl ? "Intrekken" : "Revoke"}
                    srLabel={`${nl ? "Intrekken" : "Revoke"}: ${g.userName}, ${g.count > 0 ? "+" : "\u2212"}${Math.abs(g.count)}`}
                    tone="danger"
                    className="ml-auto"
                    onClick={() => setDeleting(g)}
                  >
                    <TrashIcon />
                  </IconButton>
                </td>
              </tr>
            ))}
            {filteredGrants.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-vtk-muted">
                  {nl
                    ? "Geen manueel toegekende of afgenomen shiften voor dit academiejaar."
                    : "No manually granted or deducted shifts for this academic year."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {modal && (
        <ShiftManualGrantModal
          locale={locale}
          mode={modal}
          postOptions={postOptions}
          selectedYear={year}
          availableYears={years}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={
          deleting && deleting.count < 0
            ? nl
              ? "Afname intrekken?"
              : "Revoke deduction?"
            : nl
              ? "Manuele toekenning intrekken?"
              : "Revoke manual grant?"
        }
        description={
          deleting && deleting.count < 0
            ? nl
              ? `De afname van ${-deleting.count} shift(en) bij ${deleting.userName} vervalt: die shiften tellen weer mee in de ranglijst en de shiftgeschiedenis. Het adminlogboek houdt bij dat de afname er was.`
              : `The deduction of ${-deleting.count} shift(s) for ${deleting.userName} is lifted: those shifts count again in the ranking and the shift history. The admin audit log keeps a record of the deduction.`
            : nl
              ? `De ${deleting?.count} extra shift(en) van ${deleting?.userName} verdwijnen uit de ranglijst en de shiftgeschiedenis, met hun bonnetjes. De andere shiften van ${deleting?.userName} blijven staan.`
              : `The ${deleting?.count} extra shift(s) of ${deleting?.userName} disappear from the ranking and the shift history, with their vouchers. ${deleting?.userName}'s other shifts stay.`
        }
        confirmLabel={nl ? "Intrekken" : "Revoke"}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        pending={busyDelete}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
