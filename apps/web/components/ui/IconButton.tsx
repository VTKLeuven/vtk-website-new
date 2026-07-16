import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * Compacte icoonknop voor rij-acties in tabellen en lijsten (zie CLAUDE.md).
 *
 * `label` is verplicht: het wordt de `title` (de tooltip die een twijfelende
 * muisgebruiker ziet) en standaard ook de `aria-label`. Geef `srLabel` mee om er
 * context aan te hangen ("Verwijderen: Career Fair"); een screenreader hoort
 * anders twintig keer hetzelfde "Verwijderen" zonder te weten waarvan.
 *
 * Gebruik dit niet voor primaire acties ("Opslaan", "Nieuw evenement"); die
 * blijven tekstknoppen.
 */

const BASE =
  "grid size-8 shrink-0 place-items-center rounded-full border transition-colors disabled:opacity-50";

const TONES = {
  neutral: "border-vtk-blue/15 text-vtk-ink hover:border-vtk-blue/30 hover:bg-vtk-blue-soft/70",
  danger: "border-vtk-blue/15 text-red-600 hover:border-red-300 hover:bg-red-50",
} as const;

export type IconTone = keyof typeof TONES;

export function IconButton({
  label,
  srLabel,
  tone = "neutral",
  className,
  children,
  ...rest
}: Omit<ComponentProps<"button">, "aria-label" | "title"> & {
  label: string;
  srLabel?: string;
  tone?: IconTone;
  children: ReactNode;
}) {
  return (
    <button
      {...rest}
      type={rest.type ?? "button"}
      aria-label={srLabel ?? label}
      title={label}
      className={[BASE, TONES[tone], className ?? ""].join(" ")}
    >
      {children}
    </button>
  );
}

export function IconLink({
  label,
  srLabel,
  tone = "neutral",
  className,
  children,
  ...rest
}: Omit<ComponentProps<typeof Link>, "aria-label" | "title"> & {
  label: string;
  srLabel?: string;
  tone?: IconTone;
  children: ReactNode;
}) {
  return (
    <Link
      {...rest}
      aria-label={srLabel ?? label}
      title={label}
      className={[BASE, TONES[tone], className ?? ""].join(" ")}
    >
      {children}
    </Link>
  );
}

/** Rij-acties naast elkaar, rechts uitgelijnd. */
export function RowActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-2">{children}</div>;
}
