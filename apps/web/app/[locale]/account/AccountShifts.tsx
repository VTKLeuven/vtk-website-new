import Link from "next/link";
import { Card } from "@vtk/ui";

export type AccountShift = {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date;
  location: string;
  post: string | null;
  reward: number;
};

export function AccountShifts({
  locale,
  shifts,
}: {
  locale: "nl" | "en";
  shifts: AccountShift[];
}) {
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const dateFormatter = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const timeFormatter = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-vtk-ink">
            {nl ? "Mijn komende shiften" : "My upcoming shifts"}
          </h3>
          <p className="mt-1 text-sm text-[#5c667f]">
            {nl
              ? "Shiften waarvoor je momenteel ingeschreven bent."
              : "Shifts you are currently registered for."}
          </p>
        </div>
        <Link
          href={`${base}/shift`}
          className="font-medium text-vtk-ink underline"
        >
          {nl ? "Shiften beheren" : "Manage shifts"}
        </Link>
      </div>

      {shifts.length === 0 ? (
        <p className="mt-4 text-sm text-[#5c667f]">
          {nl ? (
            <>
              Je bent niet ingeschreven voor een komende shift.{" "}
              <Link href="/shift" className="font-medium text-vtk-ink underline">
                Bekijk beschikbare shiften
              </Link>
              .
            </>
          ) : (
            <>
              You are not registered for an upcoming shift.{" "}
              <Link href="/en/shift" className="font-medium text-vtk-ink underline">
                Browse available shifts
              </Link>
              .
            </>
          )}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {shifts.map((shift) => (
            <li
              key={shift.id}
              className="rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/35 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="font-semibold text-vtk-ink">{shift.name}</h4>
                  <p className="mt-1 text-sm capitalize text-[#34405e]">
                    {dateFormatter.format(shift.startTime)},{" "}
                    {timeFormatter.format(shift.startTime)}–
                    {timeFormatter.format(shift.endTime)}
                  </p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-vtk-ink">
                  {shift.reward} {nl ? "bonnetjes" : "vouchers"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#5c667f]">
                <span>{shift.location}</span>
                {shift.post ? (
                  <span>
                    {nl ? "Post" : "Role"}: {shift.post}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
