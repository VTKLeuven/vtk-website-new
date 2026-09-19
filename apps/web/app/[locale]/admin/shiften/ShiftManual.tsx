"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { Locale } from "@vtk/i18n";
import { Button, Card, ConfirmDialog, Input } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import { deleteManualShiftGrantAction } from "@/app/actions/manualShifts";
import { YearPicker } from "./YearPicker";
import { ShiftManualGrantModal } from "./ShiftManualGrantModal";

export type ManualGrantRow = {
  id: string;
  createdAt: Date;
  userId: string;
  userName: string;
  userEmail: string;
  userRNumber: string | null;
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

  const [modalOpen, setModalOpen] = useState(false);
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
        message: nl ? "Toekenning ingetrokken" : "Grant revoked",
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

        <Button type="button" onClick={() => setModalOpen(true)}>
          {nl ? "+ Extra shiften toekennen" : "+ Grant extra shifts"}
        </Button>
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
              <th className="px-4 py-2">{nl ? "Toegekend door" : "Granted by"}</th>
              <th className="w-20 px-4 py-2 text-right">{nl ? "Acties" : "Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {filteredGrants.map((g) => (
              <tr key={g.id} className="border-t border-zinc-200 hover:bg-zinc-50/50">
                <td className="px-4 py-2 text-xs text-zinc-500 whitespace-nowrap">
                  {format(g.createdAt, "dd/MM/yyyy HH:mm")}
                </td>
                <td className="px-4 py-2">
                  <div className="font-medium text-zinc-900">{g.userName}</div>
                  <div className="text-xs text-zinc-500">
                    {g.userEmail}
                    {g.userRNumber ? ` • ${g.userRNumber}` : ""}
                  </div>
                </td>
                <td className="px-4 py-2 font-semibold text-vtk-blue whitespace-nowrap">
                  +{g.count} {nl ? (g.count === 1 ? "shift" : "shiften") : g.count === 1 ? "shift" : "shifts"}
                </td>
                <td className="px-4 py-2 text-zinc-600">{g.post ?? "—"}</td>
                <td className="px-4 py-2 text-zinc-700">{g.reason}</td>
                <td className="px-4 py-2 text-xs text-zinc-600 whitespace-nowrap">
                  {g.reward > 0
                    ? `${g.reward} pp ${g.payedOut ? (nl ? "(uitbetaald)" : "(paid)") : nl ? "(openstaand)" : "(unpaid)"}`
                    : "0"}
                </td>
                <td className="px-4 py-2 text-xs text-zinc-500">{g.createdByName ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setDeleting(g)}
                    className="text-xs font-medium text-red-600 hover:text-red-800 hover:underline"
                  >
                    {nl ? "Intrekken" : "Revoke"}
                  </button>
                </td>
              </tr>
            ))}
            {filteredGrants.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                  {nl
                    ? "Geen manueel toegekende shiften voor dit academiejaar."
                    : "No manually granted shifts for this academic year."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {modalOpen && (
        <ShiftManualGrantModal
          locale={locale}
          postOptions={postOptions}
          selectedYear={year}
          availableYears={years}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={nl ? "Manuele toekenning intrekken?" : "Revoke manual grant?"}
        description={
          nl
            ? `Weet je zeker dat je de ${deleting?.count} extra shift(en) van ${deleting?.userName} wil intrekken? De gekoppelde shiften worden permanent verwijderd uit de ranglijst en historiek.`
            : `Are you sure you want to revoke the ${deleting?.count} extra shift(s) for ${deleting?.userName}? Linked shifts will be permanently removed from rankings and history.`
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
