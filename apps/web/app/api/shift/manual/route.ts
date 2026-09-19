import { NextResponse } from "next/server";
import { prisma } from "@vtk/db";
import { requirePermission, authErrorResponse } from "@/lib/session";
import {
  grantManualShifts,
  deleteManualShiftGrant,
  ManualShiftValidationError,
} from "@/lib/shift/manual";

export async function GET(request: Request) {
  try {
    await requirePermission("shift.manual");
  } catch (err) {
    return authErrorResponse(err);
  }

  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get("year");
  const userId = searchParams.get("userId");

  const where: { academicYear?: number; userId?: string } = {};
  if (yearParam) {
    const y = Number(yearParam);
    if (Number.isInteger(y)) where.academicYear = y;
  }
  if (userId) {
    where.userId = userId;
  }

  const grants = await prisma.manualShiftGrant.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true, rNumber: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(grants);
}

export async function POST(request: Request) {
  let session;
  try {
    session = await requirePermission("shift.manual");
  } catch (err) {
    return authErrorResponse(err);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "body must be an object" }, { status: 400 });
  }

  const src = body as Record<string, unknown>;

  try {
    const grant = await grantManualShifts({
      userId: String(src.userId ?? ""),
      count: Number(src.count ?? 1),
      post: typeof src.post === "string" ? src.post : null,
      academicYear: src.academicYear !== undefined ? Number(src.academicYear) : undefined,
      reason: typeof src.reason === "string" ? src.reason : undefined,
      reward: src.reward !== undefined ? Number(src.reward) : 0,
      payedOut: src.payedOut !== undefined ? Boolean(src.payedOut) : true,
      date: typeof src.date === "string" ? src.date : null,
      actorId: session.user.id,
      actorName: session.user.name,
    });

    return NextResponse.json(grant, { status: 201 });
  } catch (err) {
    if (err instanceof ManualShiftValidationError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.details },
        { status: 400 },
      );
    }
    throw err;
  }
}

export async function DELETE(request: Request) {
  try {
    await requirePermission("shift.manual");
  } catch (err) {
    return authErrorResponse(err);
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
  }

  const deleted = await deleteManualShiftGrant(id);
  if (!deleted) {
    return NextResponse.json({ error: "ManualShiftGrant not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
