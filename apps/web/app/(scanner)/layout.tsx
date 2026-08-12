import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "@/app/design/vtk-tickets.css";

export const viewport: Viewport = {
  themeColor: "#0a0f1f",
};

/**
 * De scanner is een werkinstrument voor aan de deur, geen pagina om te delen:
 * één keer op de layout op noindex, en verder geen metadata per scherm.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ScannerLayout({ children }: { children: ReactNode }) {
  return <div className="scanner-route-shell">{children}</div>;
}
