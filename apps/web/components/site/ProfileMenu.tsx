"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { logoutAction } from "@/app/actions/auth";

export function ProfileMenu({
  name,
  isAdmin,
  labels,
  base,
}: {
  name: string;
  isAdmin: boolean;
  labels: { myAccount: string; admin: string; logout: string };
  base: string;
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
        className="flex items-center gap-2 rounded-full border border-vtk-blue/15 bg-white px-2 py-1.5 text-sm text-vtk-blue shadow-sm transition hover:border-vtk-blue/25 hover:bg-vtk-blue-soft/60"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-vtk-yellow text-sm font-bold text-vtk-blue shadow-inner">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden sm:inline max-w-[120px] truncate font-medium">{name}</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-52 rounded-xl border border-vtk-blue/10 bg-white py-1 text-zinc-800 shadow-[0_12px_40px_-8px_rgba(26,31,74,0.18)] ring-1 ring-black/[0.03]"
        >
          <Link
            href={`${base}/account`}
            className="block px-4 py-2.5 text-sm hover:bg-vtk-blue-soft"
            role="menuitem"
          >
            {labels.myAccount}
          </Link>
          {isAdmin && (
            <Link
              href={`${base}/admin`}
              className="block px-4 py-2.5 text-sm hover:bg-vtk-blue-soft"
              role="menuitem"
            >
              {labels.admin}
            </Link>
          )}
          <form action={logoutAction}>
            <button
              type="submit"
              className="block w-full px-4 py-2.5 text-left text-sm hover:bg-vtk-blue-soft"
              role="menuitem"
            >
              {labels.logout}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
