import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type Props = HTMLAttributes<HTMLDivElement> & { children: ReactNode };

export function Card({ className, children, ...rest }: Props) {
  return (
    <div
      data-vtk-ui="card"
      className={cn(
        "rounded-2xl border border-vtk-blue/10 bg-white shadow-[0_4px_24px_-4px_rgba(26,31,74,0.08)]",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
