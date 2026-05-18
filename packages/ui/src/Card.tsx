import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type Props = HTMLAttributes<HTMLDivElement> & { children: ReactNode };

export function Card({ className, children, ...rest }: Props) {
  return (
    <div
      data-vtk-ui="card"
      className={cn(
        "rounded-[18px] border border-vtk-blue/10 bg-white shadow-[0_10px_30px_-24px_rgba(10,15,31,0.35)]",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
