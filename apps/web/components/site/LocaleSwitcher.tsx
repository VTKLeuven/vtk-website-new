"use client";

import { usePathname, useRouter } from "next/navigation";
import type { Locale } from "@/lib/locale";

export function LocaleSwitcher({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const router = useRouter();

  function switchTo(next: Locale) {
    if (next === locale) return;
    const currentPath = pathname ?? "/";
    let nextPath = currentPath;
    if (locale === "en" && currentPath.startsWith("/en")) {
      nextPath = currentPath.slice(3) || "/";
    }
    if (next === "en" && !currentPath.startsWith("/en")) {
      nextPath = `/en${currentPath === "/" ? "" : currentPath}`;
    }
    router.push(nextPath);
  }

  return (
    <div className="flex items-center rounded-full border border-vtk-blue/15 bg-vtk-blue-muted/80 p-0.5 text-xs shadow-sm">
      {(["nl", "en"] as Locale[]).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => switchTo(code)}
          className={
            "rounded-full px-2.5 py-1.5 uppercase tracking-wide transition " +
            (code === locale
              ? "bg-vtk-blue font-semibold text-white shadow-sm"
              : "text-vtk-blue/65 hover:bg-white/80 hover:text-vtk-blue")
          }
          aria-pressed={code === locale}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
