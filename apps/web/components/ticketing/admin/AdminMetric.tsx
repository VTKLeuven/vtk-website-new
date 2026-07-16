import type { LucideIcon } from "lucide-react";

export function AdminMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  detail?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <div className="ticket-admin-metric" data-tone={tone}>
      <div className="ticket-admin-metric-label">
        <Icon aria-hidden="true" size={15} strokeWidth={1.8} />
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}
