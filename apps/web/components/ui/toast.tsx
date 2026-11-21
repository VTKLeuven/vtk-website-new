'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ToastProvider as SharedToastProvider, type ToastLabels } from '@vtk/ui/toast';

/**
 * De toasts staan sinds november 2026 in `@vtk/ui/toast`, gedeeld met de
 * uitleendienst. Hier enkel de taal van vtk.be: die volgt het pad (`/en/...`).
 */
export { useToast, type ShowToast, type ToastInput, type ToastVariant } from '@vtk/ui/toast';

const LABELS: Record<'nl' | 'en', ToastLabels> = {
  nl: { region: 'Meldingen', close: 'Sluiten' },
  en: { region: 'Notifications', close: 'Close' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const en = pathname === '/en' || pathname?.startsWith('/en/');
  return <SharedToastProvider labels={LABELS[en ? 'en' : 'nl']}>{children}</SharedToastProvider>;
}
