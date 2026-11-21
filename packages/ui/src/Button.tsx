import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dangerOutline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "border border-vtk-ink bg-vtk-ink text-vtk-surface shadow-sm hover:bg-vtk-navy",
  secondary:
    "border border-vtk-yellow-dark/30 bg-vtk-yellow text-vtk-on-yellow font-semibold shadow-sm hover:bg-vtk-yellow-dark",
  ghost:
    "border border-vtk-muted/80 text-vtk-ink hover:border-vtk-ink hover:bg-vtk-blue-soft/70",
  danger: "bg-red-600 text-white hover:bg-red-700",
  // Voor een actie die routine is maar wel iets weigert (een rit afwijzen):
  // rood genoeg om op te vallen, zonder even hard te roepen als verwijderen.
  dangerOutline:
    "border border-vtk-danger-line bg-transparent text-vtk-danger hover:bg-vtk-danger-soft focus-visible:outline-vtk-danger",
};

const sizes: Record<Size, string> = {
  sm: "min-h-8 px-3 py-1 text-sm rounded-full",
  md: "min-h-10 px-4 py-2 text-sm rounded-full",
  lg: "min-h-12 px-6 py-2.5 text-base rounded-full",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 text-center font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vtk-ink",
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
