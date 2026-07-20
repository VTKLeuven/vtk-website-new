'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export function ProfileMenu({
  name,
  canManage,
  mainUrl,
  labels,
}: {
  name: string;
  canManage: boolean;
  mainUrl: string;
  labels: {
    mainSite: string;
    manage: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    []
  );

  function cancelClose() {
    if (!closeTimer.current) return;
    clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }

  function openMenu() {
    cancelClose();
    setOpen(true);
  }

  function closeMenuSoon() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }

  return (
    <div
      ref={ref}
      className="profile-menu-root"
      onMouseEnter={openMenu}
      onMouseLeave={closeMenuSoon}
      onFocus={openMenu}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="profile-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={name}
        title={name}
        onClick={() => setOpen((current) => !current)}
      >
        {name.slice(0, 1).toUpperCase()}
      </button>

      {open ? (
        <div className="profile-menu" role="menu">
          {canManage ? (
            <Link href="/beheer" className="profile-menu-item" role="menuitem">
              {labels.manage}
            </Link>
          ) : null}
          <a href={mainUrl} className="profile-menu-item" role="menuitem">
            {labels.mainSite}
          </a>
        </div>
      ) : null}
    </div>
  );
}
