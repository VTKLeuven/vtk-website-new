import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/session';
import { prisma } from '@vtk/db';
import { parseShiftRange, ShiftValidationError } from '@/lib/shift';
import { authErrorResponse } from '@/lib/session';

/**
 * Get all shifts in een bepaalde range gegeven in de request body => standaard waarde is alle shiften voor huidige academiejaar
 *
 * Enkel voor praesidium/admins. Body is optioneel en van de vorm
 * `{ "start": <date>, "end": <date> }`; ontbrekende velden vallen terug op het
 * huidige academiejaar.
 */
export async function GET(request: Request) {
  try {
    await requirePermission('shift.ranking');
  } catch (err) {
    return authErrorResponse(err);
  }

  // Body is optioneel: een lege of ontbrekende body betekent "huidig academiejaar".
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  let range;
  try {
    range = parseShiftRange(body);
  } catch (err) {
    if (err instanceof ShiftValidationError) {
      return NextResponse.json(
        { error: 'Validation failed', details: err.details },
        { status: 400 }
      );
    }
    throw err;
  }

  const shifts = await prisma.shift.findMany({
    where: { startTime: { gte: range.start, lt: range.end } },
    orderBy: { startTime: 'asc' },
    include: {
      participants: {
        select: {
          userId: true,
          payedOut: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  return NextResponse.json(shifts);
}
