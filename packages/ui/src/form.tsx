import { forwardRef } from "react";
import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "./cn";

const base =
  "w-full rounded-xl border border-vtk-blue/12 bg-white px-3 py-2 text-sm text-vtk-ink shadow-sm placeholder:text-zinc-400 focus:border-vtk-ink focus:outline-none focus:ring-2 focus:ring-vtk-blue/10 disabled:cursor-not-allowed disabled:opacity-50";

// forwardRef zodat callers (bvb een auto-focus scannerveld) een ref kunnen meegeven.
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(base, className)} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(base, "min-h-[6rem]", className)} {...rest} />;
  },
);

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }
>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(base, className)} {...rest}>
      {children}
    </select>
  );
});

export function Label({
  className,
  children,
  ...rest
}: LabelHTMLAttributes<HTMLLabelElement> & { children: ReactNode }) {
  return (
    <label className={cn("block text-xs font-semibold uppercase tracking-[0.08em] text-[#5c667f] mb-1.5", className)} {...rest}>
      {children}
    </label>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="mt-1 text-sm text-red-600">{children}</p>;
}
