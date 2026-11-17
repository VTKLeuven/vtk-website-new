"use client";

import Link from "@/components/ui/Link";
import { useOverviewHref } from "./overviewMemory";

/** "Groepsadressen" boven een adres: terug naar de lijst zoals je ze achterliet. */
export function OverviewBackLink({ base, label }: { base: string; label: string }) {
  const href = useOverviewHref(base);
  return (
    <Link href={href} className="vtk-link text-sm">
      {label}
    </Link>
  );
}
