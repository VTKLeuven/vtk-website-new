import { cn } from "@vtk/ui";

/** Eén aanvinkbare optie in een multi-select groep (mailinglijsten, studie, ...). */
export function CheckboxChip({
  name,
  value,
  defaultChecked,
  label,
  className,
}: {
  name: string;
  value: string;
  defaultChecked: boolean;
  label: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/30 px-3 py-2 text-sm",
        className,
      )}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="shrink-0"
      />
      <span className="min-w-0 break-words">{label}</span>
    </label>
  );
}
