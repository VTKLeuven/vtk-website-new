"use client";

import { Button } from "@vtk/ui";

export function PrintButton({ label }: { label: string }) {
  return (
    <Button size="sm" onClick={() => window.print()} className="no-print">
      {label}
    </Button>
  );
}
