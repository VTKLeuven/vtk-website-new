"use client";

import { Button, Card, Input, Label, Select } from "@vtk/ui";
import {
  correctOrderStatusAction,
  createBanAction,
  liftBanAction,
  updateBanAction,
} from "@/app/actions/theokot";

export type BanRow = {
  id: string;
  userName: string;
  rNumber: string;
  reason: string;
  note: string;
  startsLabel: string;
  endsValue: string;
  endsLabel: string;
  active: boolean;
  stored: boolean;
};

export type NoShowRow = {
  orderId: string;
  userName: string;
  rNumber: string;
  dateLabel: string;
  totalLabel: string;
  note: string;
};

export function BansClient({ nl, bans, noShows }: { nl: boolean; bans: BanRow[]; noShows: NoShowRow[] }) {
  return (
    <div className="space-y-6">
      {/* Manuele ban */}
      <Card className="p-5">
        <h2 className="mb-3 text-lg font-semibold">{nl ? "Manuele ban" : "Manual ban"}</h2>
        <form action={createBanAction} className="flex flex-wrap items-end gap-3">
          <div>
            <Label>{nl ? "R-nummer" : "R-number"}</Label>
            <Input name="rNumber" placeholder="r0123456" required />
          </div>
          <div>
            <Label>{nl ? "Dagen" : "Days"}</Label>
            <Input name="days" type="number" min={1} defaultValue={14} className="w-24" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <Label>{nl ? "Reden" : "Reason"}</Label>
            <Input name="reason" placeholder={nl ? "Reden" : "Reason"} />
          </div>
          <Button type="submit">{nl ? "Ban toevoegen" : "Add ban"}</Button>
        </form>
      </Card>

      {/* Bans-lijst */}
      <Card className="p-5">
        <h2 className="mb-3 text-lg font-semibold">{nl ? "Bans" : "Bans"}</h2>
        {bans.length === 0 ? (
          <p className="text-sm text-[#5c667f]">{nl ? "Geen bans." : "No bans."}</p>
        ) : (
          <ul className="divide-y divide-vtk-blue/10">
            {bans.map((b) => (
              <li key={b.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-vtk-ink">{b.userName}</span>{" "}
                    <span className="text-xs text-[#5c667f]">{b.rNumber}</span>
                    <span
                      className={`ml-2 vtk-basic-badge ${
                        b.active ? "vtk-basic-badge-danger" : "vtk-basic-badge-muted"
                      }`}
                    >
                      {b.active ? (nl ? "Actief" : "Active") : nl ? "Inactief" : "Inactive"}
                    </span>
                  </div>
                  <span className="text-xs text-[#5c667f]">
                    {b.startsLabel} → {b.endsLabel}
                  </span>
                </div>
                <div className="mt-1 text-sm text-[#34405e]">{b.reason}</div>
                <form action={updateBanAction} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="banId" value={b.id} />
                  <div>
                    <Label>{nl ? "Einddatum" : "End date"}</Label>
                    <Input type="date" name="endsAt" defaultValue={b.endsValue} className="w-40" />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <Label>{nl ? "Notitie" : "Note"}</Label>
                    <Input name="note" defaultValue={b.note} />
                  </div>
                  <label className="inline-flex items-center gap-1 pb-2 text-sm">
                    <input type="checkbox" name="active" defaultChecked={b.stored} />
                    {nl ? "Actief" : "Active"}
                  </label>
                  <Button type="submit" size="sm" variant="ghost">
                    {nl ? "Opslaan" : "Save"}
                  </Button>
                </form>
                {b.stored && (
                  <form action={liftBanAction} className="mt-1">
                    <input type="hidden" name="banId" value={b.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      {nl ? "Ban opheffen" : "Lift ban"}
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* No-show-historiek + correcties */}
      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold">{nl ? "No-show historiek" : "No-show history"}</h2>
        <p className="mb-3 text-sm text-[#5c667f]">
          {nl
            ? "Corrigeer een foutieve no-show. 'Ban opheffen' zet meteen de actieve ban van de persoon uit."
            : "Correct an erroneous no-show. 'Lift ban' also deactivates the person's active ban."}
        </p>
        {noShows.length === 0 ? (
          <p className="text-sm text-[#5c667f]">{nl ? "Geen no-shows." : "No no-shows."}</p>
        ) : (
          <ul className="divide-y divide-vtk-blue/10">
            {noShows.map((o) => (
              <li key={o.orderId} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-vtk-ink">{o.userName}</span>{" "}
                    <span className="text-xs text-[#5c667f]">{o.rNumber}</span>
                  </div>
                  <span className="text-xs text-[#5c667f]">
                    {o.dateLabel} · {o.totalLabel}
                  </span>
                </div>
                <form action={correctOrderStatusAction} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="orderId" value={o.orderId} />
                  <div>
                    <Label>{nl ? "Corrigeer naar" : "Correct to"}</Label>
                    <Select name="status" defaultValue="PICKED_UP" className="w-44">
                      <option value="PICKED_UP">{nl ? "Opgehaald" : "Picked up"}</option>
                      <option value="CANCELLED">{nl ? "Geannuleerd" : "Cancelled"}</option>
                      <option value="RESERVED">{nl ? "Gereserveerd" : "Reserved"}</option>
                      <option value="NO_SHOW">{nl ? "Niet opgehaald" : "No-show"}</option>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <Label>{nl ? "Notitie" : "Note"}</Label>
                    <Input name="note" defaultValue={o.note} placeholder={nl ? "Reden van correctie" : "Reason"} />
                  </div>
                  <label className="inline-flex items-center gap-1 pb-2 text-sm">
                    <input type="checkbox" name="liftBan" />
                    {nl ? "Ban opheffen" : "Lift ban"}
                  </label>
                  <Button type="submit" size="sm">
                    {nl ? "Corrigeren" : "Correct"}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
