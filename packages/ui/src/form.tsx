import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "./cn";

const base =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-vtk-blue focus:outline-none focus:ring-2 focus:ring-vtk-blue/20 disabled:cursor-not-allowed disabled:opacity-50";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(base, "min-h-[6rem]", className)} {...rest} />;
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select className={cn(base, className)} {...rest}>
      {children}
    </select>
  );
}

export function Label({
  className,
  children,
  ...rest
}: LabelHTMLAttributes<HTMLLabelElement> & { children: ReactNode }) {
  return (
    <label className={cn("block text-sm font-medium text-vtk-blue/90 mb-1", className)} {...rest}>
      {children}
    </label>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="mt-1 text-sm text-red-600">{children}</p>;
}
