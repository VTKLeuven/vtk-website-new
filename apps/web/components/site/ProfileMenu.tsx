"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { logoutAction } from "@/app/actions/auth";

export function ProfileMenu({
  name,
  isAdmin,
  labels,
  base,
  variant = "default",
}: {
  name: string;
  isAdmin: boolean;
  labels: { myAccount: string; admin: string; logout: string };
  base: string;
  variant?: "default" | "editorial";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const triggerClass =
    variant === "editorial"
      ? "avatar-btn"
      : "flex items-center gap-2 rounded-full border border-vtk-blue/15 bg-white px-2 py-1.5 text-sm text-vtk-blue shadow-sm transition hover:border-vtk-blue/25 hover:bg-vtk-blue-soft/60";

  const menuClass =
    variant === "editorial"
      ? "absolute right-0 z-50 mt-2 w-52 border py-1 text-[11px] uppercase tracking-wider shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
      : "absolute right-0 mt-2 w-52 rounded-xl border border-vtk-blue/10 bg-white py-1 text-zinc-800 shadow-[0_12px_40px_-8px_rgba(26,31,74,0.18)] ring-1 ring-black/[0.03]";

  const menuStyle =
    variant === "editorial"
      ? {
          borderColor: "var(--rule)",
          background: "var(--paper)",
          color: "var(--ink)",
          fontFamily: "var(--mono)",
        }
      : undefined;

  const itemClass =
    variant === "editorial"
      ? "block px-4 py-2.5 tracking-wide hover:bg-[var(--paper-2)]"
      : "block px-4 py-2.5 text-sm hover:bg-vtk-blue-soft";

  return (
    <div
      className="relative"
      ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {variant === "editorial" ? (
          name.slice(0, 1).toUpperCase()
        ) : (
          <>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-vtk-yellow text-sm font-bold text-vtk-blue shadow-inner">
              {name.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden max-w-[120px] truncate font-medium sm:inline">{name}</span>
          </>
        )}
      </button>
      {open && (
        <div role="menu" className={menuClass} style={menuStyle}>
          <Link href={`${base}/account`} className={itemClass} role="menuitem">
            {labels.myAccount}
          </Link>
          {isAdmin && (
            <Link href={`${base}/admin`} className={itemClass} role="menuitem">
              {labels.admin}
            </Link>
          )}
          <form action={logoutAction}>
            <button type="submit" className={`${itemClass} w-full text-left`} role="menuitem">
              {labels.logout}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
