import "server-only";

import { prisma } from "@vtk/db";

import type { AppPlanningOperation, AppPlanningPersonal, AppPlanningPersonalInput } from "@/lib/app-api/contract";

/**
 * De eigen, privé items in de planning van de app. Lessen, deadlines en
 * VTK-evenementen komen van Burgieclan (`planning.ts`); deze bewaart vtk.be zelf
 * (`PlanningPersonalItem`), want Burgieclan kent enkel items bij een vak. Elke
 * planning die de app krijgt, draagt ze in `personal`.
 */

/** Hoe ver terug de app ze krijgt; het raster toont vier weken terug. */
const LOOKBACK_DAYS = 60;

export type PersonalOperation = Extract<AppPlanningOperation, { op: "addPersonal" | "updatePersonal" | "deletePersonal" }>;

export function isPersonalOperation(operation: AppPlanningOperation): operation is PersonalOperation {
  return operation.op === "addPersonal" || operation.op === "updatePersonal" || operation.op === "deletePersonal";
}

/** Gevonden noch van jou: dezelfde fout, zodat een id niet verraadt dat hij bestaat. */
export class PersonalItemNotFound extends Error {}

function fields(item: AppPlanningPersonalInput) {
  return {
    title: item.title.trim(),
    location: item.location?.trim() || null,
    note: item.note.trim(),
    date: item.date,
    allDay: item.allDay,
    start: item.allDay ? null : item.start,
    end: item.allDay ? null : item.end,
  };
}

export async function applyPersonalOperation(userId: string, operation: PersonalOperation): Promise<void> {
  switch (operation.op) {
    case "addPersonal":
      await prisma.planningPersonalItem.create({ data: { userId, ...fields(operation.item) } });
      return;
    case "updatePersonal": {
      const { count } = await prisma.planningPersonalItem.updateMany({
        where: { id: operation.id, userId },
        data: fields(operation.item),
      });
      if (count === 0) throw new PersonalItemNotFound();
      return;
    }
    case "deletePersonal": {
      const { count } = await prisma.planningPersonalItem.deleteMany({ where: { id: operation.id, userId } });
      if (count === 0) throw new PersonalItemNotFound();
      return;
    }
  }
}

const minutes = (time: string | null, fallback: number) => {
  if (!time) return fallback;
  const [h, m] = time.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : fallback;
};

export async function personalItems(userId: string, today: string): Promise<AppPlanningPersonal[]> {
  const base = today ? new Date(`${today}T12:00:00Z`) : new Date();
  base.setUTCDate(base.getUTCDate() - LOOKBACK_DAYS);
  const from = base.toISOString().slice(0, 10);
  const rows = await prisma.planningPersonalItem.findMany({
    where: { userId, date: { gte: from } },
    orderBy: [{ date: "asc" }, { start: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    location: row.location,
    note: row.note,
    date: row.date,
    allDay: row.allDay,
    start: row.allDay ? null : row.start,
    end: row.allDay ? null : row.end,
    startMin: row.allDay ? 0 : minutes(row.start, 0),
    endMin: row.allDay ? 1440 : minutes(row.end, minutes(row.start, 0) + 60),
  }));
}
