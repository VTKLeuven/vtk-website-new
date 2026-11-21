'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Escape sluit het paneel van een rit, zoals het kruisje rechtsboven. */
export function PanelEscape({ closeHref }: { closeHref: string }) {
  const router = useRouter();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // Een open dialoog (bevestigen) sluit eerst zichzelf.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      router.replace(closeHref, { scroll: false });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeHref, router]);
  return null;
}
