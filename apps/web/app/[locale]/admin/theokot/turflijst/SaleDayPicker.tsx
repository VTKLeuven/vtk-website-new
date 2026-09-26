"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ThemedSelect, type ThemedSelectOption } from "@/components/ui/ThemedSelect";

/**
 * De verkoopdag van de lijst bestelde broodjes: kiezen is meteen tonen.
 *
 * Er stond een native `<select>` met een knop "Tonen" ernaast, zodat je na het
 * kiezen nog eens moest klikken voor er iets veranderde. Een keuze navigeert nu
 * zelf naar dezelfde URL (`?date=`), dus terugknop en een gedeelde link blijven
 * werken zoals voordien.
 */
export function SaleDayPicker({
  base,
  label,
  options,
  selected,
  showAll,
}: {
  base: string;
  label: string;
  options: ThemedSelectOption[];
  selected: string;
  showAll: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(date: string) {
    const params = new URLSearchParams({ date });
    if (showAll) params.set("alles", "1");
    startTransition(() => router.push(`${base}/admin/theokot/turflijst?${params.toString()}`));
  }

  return (
    <div aria-busy={pending} style={{ minWidth: 260, opacity: pending ? 0.6 : 1 }}>
      <label
        htmlFor="turf-sale-day"
        className="block text-xs font-semibold uppercase tracking-wide text-[#5c667f]"
      >
        {label}
      </label>
      <div className="mt-1">
        <ThemedSelect
          id="turf-sale-day"
          name="date"
          options={options}
          defaultValue={selected}
          onChange={choose}
        />
      </div>
    </div>
  );
}
