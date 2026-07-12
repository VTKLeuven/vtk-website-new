import type { ReactNode } from "react";

import "@/app/design/vtk-tickets.css";

export default function ScannerLayout({ children }: { children: ReactNode }) {
  return <div className="scanner-route-shell">{children}</div>;
}
