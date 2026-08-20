"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { logoutAction } from "@/app/actions/auth";
import { OUTBOUND_EVENT, outboundHost, umamiEvent } from "@/lib/analytics";
import type { PostAdminLink } from "@/lib/postAdminLinks";

export function ProfileMenu({
  name,
  isAdmin,
  tools,
  canReserveGrocomeet,
  grocomeetNeedsAttention = false,
  labels,
  base,
  variant = "default",
}: {
  name: string;
  isAdmin: boolean;
  /** Beheerschermen van een post op een andere site; leeg voor wie er geen heeft. */
  tools: PostAdminLink[];
  /** Postverantwoordelijken en Groep 5 bestellen hier hun broodje voor de GM. */
  canReserveGrocomeet: boolean;
  /** Een reservatie werd ongeldig; er moet opnieuw gekozen worden. */
  grocomeetNeedsAttention?: boolean;
  labels: {
    myAccount: string;
    admin: string;
    grocomeet: string;
    grocomeetAttention: string;
    logout: string;
  };
  base: string;
  variant?: "default" | "editorial";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Clean up a pending hover-close timer on unmount.
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function hoverOpen() {
    cancelClose();
    setOpen(true);
  }

  // Small delay so moving the cursor across the gap to the menu does not close it.
  function hoverClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }

  const editorial = variant === "editorial";

  const triggerClass = editorial
    ? "profile-menu-trigger"
    : "flex items-center gap-2 rounded-full border border-vtk-blue/15 bg-white px-2 py-1.5 text-sm text-vtk-blue shadow-sm transition hover:border-vtk-blue/25 hover:bg-vtk-blue-soft/60";

  const menuClass = editorial
    ? "profile-menu"
    : "absolute right-0 z-50 mt-2 w-52 rounded-xl border border-vtk-blue/10 bg-white py-1 text-zinc-800 shadow-[0_12px_40px_-8px_rgba(26,31,74,0.18)] ring-1 ring-black/[0.03]";

  const itemClass = editorial ? "profile-menu-item" : "block px-4 py-2.5 text-sm hover:bg-vtk-blue-soft";

  // In de header hangt het paneel altijd in de DOM en regelt de CSS het openen,
  // zodat het net als de navigatiepanelen kan in- en uitfaden. `visibility:
  // hidden` houdt het dicht ook uit de tabvolgorde en de screenreader.
  const openAttr = editorial && open ? "" : undefined;

  return (
    <div
      className={editorial ? "profile-shell" : "relative"}
      data-open={openAttr}
      ref={ref}
      onMouseEnter={hoverOpen}
      onMouseLeave={hoverClose}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {editorial ? (
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
      {(editorial || open) && (
        <div role="menu" className={menuClass} data-open={openAttr}>
          <Link href={`${base}/account`} className={itemClass} role="menuitem">
            {labels.myAccount}
          </Link>
          {canReserveGrocomeet && (
            <Link href={`${base}/grocomeet`} className={itemClass} role="menuitem">
              {labels.grocomeet}
              {grocomeetNeedsAttention && (
                <>
                  {/* Een stip alleen zegt niets tegen een screenreader. */}
                  <span
                    aria-hidden="true"
                    className="ml-2 inline-block h-2 w-2 rounded-full bg-vtk-yellow align-middle"
                  />
                  <span className="sr-only">({labels.grocomeetAttention})</span>
                </>
              )}
            </Link>
          )}
          {isAdmin && (
            <Link href={`${base}/admin`} className={itemClass} role="menuitem">
              {labels.admin}
            </Link>
          )}
          {/* De beheerschermen die elders wonen, meteen na /admin: ze horen bij
              hetzelfde "waar beheer ik mijn post". Ze openen in een nieuw tabblad,
              zoals elke externe bestemming in de header. */}
          {tools.map((tool) => (
            <a
              key={tool.key}
              href={tool.href}
              target="_blank"
              rel="noreferrer noopener"
              className={itemClass}
              role="menuitem"
              {...umamiEvent(OUTBOUND_EVENT, {
                bestemming: outboundHost(tool.href),
                vanaf: "account",
              })}
            >
              {tool.label}
            </a>
          ))}
          <form action={logoutAction}>
            <button type="submit" className={`${itemClass} text-left`} role="menuitem">
              {labels.logout}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
