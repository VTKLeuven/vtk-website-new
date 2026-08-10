import "@/app/design/vtk-ticket-admin.css";
import "@/app/design/vtk-form-admin.css";

/**
 * `ticket-admin` staat hier bewust op de root: die klasse draagt de kleurtokens
 * van de gedeelde adminskin (zie vtk-form-admin.css voor de reden).
 */
export default function FormAdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="ticket-admin">{children}</div>;
}
