import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "./index";

export type SearchUserResult = {
  id: string;
  name: string;
  email: string;
  rNumber: string | null;
  phone: string | null;
};

export type SearchUserOptions = {
  limit?: number;
  db?: PrismaClient;
};

/**
 * Zoek actieve gebruikers op naam, e-mail of r-nummer (server-side, gelimiteerd).
 *
 * Ondersteunt accent- en trema-onafhankelijk zoeken via PostgreSQL `unaccent`:
 * - "zoe" matcht "Zoë" en omgekeerd.
 * - "theo" matcht "Théo" en omgekeerd.
 * - Meerdere termen ("danae velde") worden opgesplitst en moeten allemaal voorkomen.
 *
 * Bevat een automatische terugval naar Prisma `findMany` wanneer `unaccent` niet
 * beschikbaar is (bv. in mock tests).
 */
export async function searchUsers(
  query: string,
  optionsOrLimit?: number | SearchUserOptions,
  client?: PrismaClient
): Promise<SearchUserResult[]> {
  const limit =
    typeof optionsOrLimit === "number"
      ? Math.max(1, Math.min(optionsOrLimit, 50))
      : Math.max(1, Math.min(optionsOrLimit?.limit ?? 20, 50));

  const db = (typeof optionsOrLimit === "object" ? optionsOrLimit.db : client) ?? defaultPrisma;

  const clean = (query ?? "").trim().slice(0, 200);
  if (clean.length < 2) return [];

  const tokens = clean.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  try {
    const conditions = tokens.map(
      (token) => Prisma.sql`(
        unaccent("name") ILIKE ('%' || unaccent(${token}) || '%')
        OR unaccent("email") ILIKE ('%' || unaccent(${token}) || '%')
        OR "rNumber" ILIKE ('%' || ${token} || '%')
      )`
    );

    const whereClause = Prisma.join(conditions, " AND ");

    const rows = await db.$queryRaw<SearchUserResult[]>`
      SELECT "id", "name", "email", "rNumber", "phone"
      FROM "User"
      WHERE "active" = true
        AND "deletedAt" IS NULL
        AND ${whereClause}
      ORDER BY "name" ASC
      LIMIT ${limit}
    `;

    return rows;
  } catch {
    // Terugval naar standaard Prisma queries bij ontbrekende extensie (bv. sqlite of mocks)
    const rows = await db.user.findMany({
      where: {
        active: true,
        deletedAt: null,
        AND: tokens.map((token) => ({
          OR: [
            { name: { contains: token, mode: "insensitive" as const } },
            { email: { contains: token, mode: "insensitive" as const } },
            { rNumber: { contains: token, mode: "insensitive" as const } },
          ],
        })),
      },
      orderBy: { name: "asc" },
      take: limit,
      select: { id: true, name: true, email: true, rNumber: true, phone: true },
    });

    return rows;
  }
}
