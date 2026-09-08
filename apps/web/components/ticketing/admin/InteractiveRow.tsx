"use client";

import type { ComponentProps } from "react";

/** Keep the real link/summary as the keyboard target; extend its click area to the row. */
export function InteractiveRow({ children, className = "", ...props }: ComponentProps<"tr">) {
  return (
    <tr {...props} className={`ticket-admin-interactive-row ${className}`} onClick={(event) => {
      const target = event.target as HTMLElement;
      if (target.closest("a, button, input, select, textarea, label, summary, .ticket-admin-row-details-panel")) return;
      if (window.getSelection()?.toString()) return;
      const action = event.currentTarget.querySelector<HTMLElement>("summary, a[href]");
      action?.click();
    }}>
      {children}
    </tr>
  );
}
