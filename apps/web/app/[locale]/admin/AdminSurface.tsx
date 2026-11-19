'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { ADMIN_DENSITY_COOKIE } from '@/lib/adminNavCookie';

type AdminDensity = { compact: boolean; setCompact: (compact: boolean) => void };

const AdminDensityContext = createContext<AdminDensity | null>(null);

/** Onthoudt de keuze voor de volgende pagina; zie `lib/adminNavCookie.ts`. */
function rememberCompact(compact: boolean) {
  document.cookie = compact
    ? `${ADMIN_DENSITY_COOKIE}=compact; path=/; max-age=31536000; samesite=lax`
    : `${ADMIN_DENSITY_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/**
 * De omslag van elke adminpagina. Ze draagt de compacte stand als
 * `data-density`, zodat `vtk-admin.css` de maten van de hele admin in één keer
 * kan omzetten: zijbalk, tabellen, knoppen, velden en kaarten.
 *
 * De stand leeft hier en niet in de zijbalk, omdat de knop in de zijbalk staat
 * maar het attribuut op de omslag eromheen moet. De layout geeft de stand uit
 * het cookie mee, zodat de server meteen de juiste maten rendert.
 */
export function AdminSurface({ initialCompact, children }: { initialCompact: boolean; children: ReactNode }) {
  const [compact, setCompactState] = useState(initialCompact);
  const setCompact = (next: boolean) => {
    setCompactState(next);
    rememberCompact(next);
  };

  return (
    <AdminDensityContext value={{ compact, setCompact }}>
      <div className="vtk-admin-surface" data-density={compact ? 'compact' : undefined}>
        {children}
      </div>
    </AdminDensityContext>
  );
}

/** De compacte stand en de schakelaar ervan; null buiten `AdminSurface`. */
export function useAdminDensity(): AdminDensity | null {
  return useContext(AdminDensityContext);
}
