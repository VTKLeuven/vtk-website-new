import "@/app/design/vtk-ticket-admin.css";
import "@/app/design/vtk-form-admin.css";
import "@/app/design/vtk-apps-admin.css";

/**
 * De apps delen de adminskin van de forms: `ticket-admin` op de root draagt de
 * kleurtokens (zie vtk-form-admin.css), en de groepjesmaker gebruikt dezelfde
 * velden en panelen als de forminstellingen.
 */
export default function AppsAdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="ticket-admin">{children}</div>;
}
