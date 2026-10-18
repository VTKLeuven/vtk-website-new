import type { ReactNode } from "react";
import Link from "@/components/ui/Link";

/** Een filter als pil-link, zoals Aankomend en Verleden boven de evenementen. */
export function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
          : "border-vtk-blue/15 text-vtk-ink hover:border-vtk-blue/30 hover:bg-vtk-blue-soft/70",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
