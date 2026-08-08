import { NextResponse } from "next/server";
import { requireSession, authErrorResponse } from "@/lib/session";
import { searchAddresses } from "@/lib/ticketing/addressSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Adressuggesties voor de adreskiezer in admin.
 *
 * `GET /api/admin/address-search?q=<term>`
 *
 * De browser praat enkel met deze route, nooit rechtstreeks met de
 * geocoder: zo blijft een eventuele Google-sleutel server-side. De route is
 * afgeschermd omdat ze anders een open proxy op andermans dienst zou zijn;
 * de teruggegeven gegevens zelf zijn publieke kaartdata.
 */
export async function GET(request: Request) {
  let session;
  try {
    session = await requireSession();
  } catch (error) {
    return authErrorResponse(error);
  }

  const allowed =
    session.user.isSuperAdmin ||
    session.permissions.includes("tickets.create") ||
    session.permissions.includes("tickets.manageAll") ||
    session.permissions.includes("calendar.create") ||
    session.permissions.includes("calendar.manageAll");
  if (!allowed) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < 3) return NextResponse.json([]);

  return NextResponse.json(await searchAddresses(query));
}
