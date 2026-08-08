import type { Viewport } from "next";
import type { ReactNode } from "react";

import "@/app/design/vtk-tickets.css";

export const viewport: Viewport = {
  themeColor: "#0a0f1f",
};

export default function ScannerLayout({ children }: { children: ReactNode }) {
  return <div className="scanner-route-shell">{children}</div>;
}
