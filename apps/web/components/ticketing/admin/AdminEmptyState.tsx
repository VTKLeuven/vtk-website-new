import type { LucideIcon } from "lucide-react";

export function AdminEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="ticket-admin-empty-state">
      <Icon aria-hidden="true" size={22} strokeWidth={1.7} />
      <p className="ticket-admin-empty-title">{title}</p>
      {description ? <p className="ticket-admin-empty-copy">{description}</p> : null}
      {action ? <div className="ticket-admin-empty-action">{action}</div> : null}
    </div>
  );
}
