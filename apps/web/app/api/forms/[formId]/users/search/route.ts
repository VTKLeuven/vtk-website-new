import { NextResponse } from "next/server";
import { prisma, searchUsers } from "@vtk/db";
import { requireFormCapability } from "@/lib/forms/authorization";

/** Zoek enkel na een live MANAGE_ACCESS-check, zodat de picker geen extra recht vereist. */
export async function GET(request: Request, { params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  try {
    await requireFormCapability(formId, "MANAGE_ACCESS");
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHENTICATED";
    const status = code === "FORM_NOT_FOUND" ? 404 : code === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: code }, { status });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 200);

  const users = await searchUsers(query, { limit: 20, db: prisma });

  return NextResponse.json(users);
}
