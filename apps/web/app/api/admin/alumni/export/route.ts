import { NextResponse } from "next/server";
import { requirePermission, authErrorResponse } from "@/lib/session";
import { listAlumniRecipients, toAlumniCsv } from "@/lib/alumni";

/**
 * Download van de alumni-mailinglijst: het adresboek plus de site-accounts met
 * een alumni-opt-in, op e-mailadres ontdubbeld. `?jaar=2004` beperkt tot één
 * lichting; alumni zonder ingevuld afstudeerjaar vallen daar dan uit, want we
 * weten niet of ze erbij horen.
 */
export async function GET(request: Request) {
  try {
    await requirePermission("alumni.manage");
  } catch (err) {
    return authErrorResponse(err);
  }

  const raw = new URL(request.url).searchParams.get("jaar");
  const year = raw && /^\d{4}$/.test(raw) ? Number(raw) : null;

  const recipients = await listAlumniRecipients({ year });
  const name = year ? `vtk-alumni-${year}` : "vtk-alumni";

  return new NextResponse(toAlumniCsv(recipients), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}.csv"`,
      "cache-control": "no-store",
    },
  });
}
