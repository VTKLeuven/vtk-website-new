import { cn } from "@vtk/ui";

/** Eén aanvinkbare optie in een multi-select groep (mailinglijsten, studie, ...). */
export function CheckboxChip({
  name,
  value,
  defaultChecked,
  label,
  ariaDescribedBy,
  className,
}: {
  name: string;
  value: string;
  defaultChecked: boolean;
  label: string;
  ariaDescribedBy?: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 rounded-xl border border-vtk-muted/80 bg-vtk-blue-soft/30 px-3 py-2 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-vtk-ink",
        className,
      )}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        aria-describedby={ariaDescribedBy}
        className="shrink-0"
      />
      <span className="min-w-0 break-words">{label}</span>
    </label>
  );
}
